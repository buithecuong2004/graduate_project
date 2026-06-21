import fs from "fs";
import { uploadFile, deleteFile } from "../configs/storage.js";
import GroupChat from "../models/GroupChat.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

const userSelect = 'full_name username profile_picture _id isOnline lastSeen';

const getUserId = (value) => value?._id?.toString?.() || value?.toString?.() || '';

const isGroupMember = (group, userId) => (
    group?.members?.some((member) => getUserId(member.user) === userId.toString())
);

const getMemberIds = (group) => (
    (group?.members || []).map((member) => getUserId(member.user)).filter(Boolean)
);

const populateGroup = (query) => query
    .populate('creator', userSelect)
    .populate('members.user', userSelect);

const normalizeMemberIds = (value) => {
    const values = Array.isArray(value) ? value : (value ? [value] : []);
    return values.map((id) => id?.toString?.() || id).filter(Boolean);
};

const emitGroupUpdated = async (req, groupId) => {
    const io = req.app.locals.io;
    if (!io) return;

    const group = await populateGroup(GroupChat.findById(groupId).lean());
    if (!group) return;

    getMemberIds(group).forEach((memberId) => {
        io.to(`user-${memberId}`).emit('group-chat-updated', group);
    });
};

const deleteS3File = async (fileKey) => {
    if (!fileKey) return true;
    try {
        await deleteFile(fileKey);
        return true;
    } catch (error) {
        console.log('S3 delete error:', error.message);
        return false;
    }
};

export const createGroupChat = async (req, res) => {
    try {
        const userId = req.userId;
        const name = (req.body.name || '').trim();
        const memberIds = normalizeMemberIds(req.body['member_ids[]'] ?? req.body.member_ids);

        if (!name) return res.json({ success: false, message: 'Group name is required' });

        const uniqueMemberIds = [...new Set([userId, ...memberIds])];
        if (uniqueMemberIds.length < 2) {
            return res.json({ success: false, message: 'Select at least one member' });
        }

        const validMembers = await User.find({ _id: { $in: uniqueMemberIds } }).select('_id').lean();
        const validMemberIds = new Set(validMembers.map((user) => user._id.toString()));
        if (!validMemberIds.has(userId) || validMemberIds.size < uniqueMemberIds.length) {
            return res.json({ success: false, message: 'Some members were not found' });
        }

        const group = await GroupChat.create({
            name,
            creator: userId,
            members: uniqueMemberIds.map((id) => ({ user: id }))
        });

        const populatedGroup = await populateGroup(GroupChat.findById(group._id).lean());
        const io = req.app.locals.io;
        if (io) {
            uniqueMemberIds.forEach((memberId) => {
                io.to(`user-${memberId}`).emit('group-chat-created', populatedGroup);
            });
        }

        res.json({ success: true, message: 'Group chat created', group: populatedGroup });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export const getMyGroupChats = async (req, res) => {
    try {
        const userId = req.userId;

        // Fetch all groups in one query with populate
        const groups = await populateGroup(
            GroupChat.find({ 'members.user': userId }).sort({ updatedAt: -1 }).lean()
        );

        if (groups.length === 0) {
            return res.json({ success: true, groups: [] });
        }

        // Fetch latest message for ALL groups in a single aggregation (no N+1)
        const groupIds = groups.map((g) => g._id);
        const latestMessages = await Message.aggregate([
            { $match: { group_id: { $in: groupIds }, deletedFor: { $ne: userId } } },
            { $sort: { createdAt: -1 } },
            { $group: { _id: '$group_id', latestMsg: { $first: '$$ROOT' } } }
        ]);

        // Batch-fetch senders for latest messages
        const senderIds = [...new Set(latestMessages.map((lm) => lm.latestMsg.from_user_id?.toString()).filter(Boolean))];
        const senderUsers = senderIds.length > 0
            ? await User.find({ _id: { $in: senderIds } }).select(userSelect).lean()
            : [];
        const senderMap = Object.fromEntries(senderUsers.map((u) => [u._id.toString(), u]));

        const latestMap = Object.fromEntries(
            latestMessages.map((lm) => {
                const msg = lm.latestMsg;
                const senderId = msg.from_user_id?.toString();
                if (senderId && senderMap[senderId]) msg.from_user_id = senderMap[senderId];
                return [lm._id.toString(), msg];
            })
        );

        const groupsWithLatest = groups.map((group) => ({
            ...group,
            latestMessage: latestMap[group._id.toString()] || null
        }));

        res.json({ success: true, groups: groupsWithLatest });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export const getGroupChatById = async (req, res) => {
    try {
        const userId = req.userId;
        const { groupId } = req.params;
        const group = await populateGroup(GroupChat.findById(groupId).lean());

        if (!group) return res.json({ success: false, message: 'Group chat not found' });
        if (!isGroupMember(group, userId)) {
            return res.json({ success: false, message: 'You are not a member of this group' });
        }

        res.json({ success: true, group });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export const updateGroupChat = async (req, res) => {
    try {
        const userId = req.userId;
        const { groupId } = req.params;
        const name = (req.body.name || '').trim();
        const avatar = req.files?.avatar?.[0] || null;

        const group = await GroupChat.findById(groupId);
        if (!group) return res.json({ success: false, message: 'Group chat not found' });
        if (!isGroupMember(group, userId)) {
            if (avatar?.path) fs.unlink(avatar.path, () => {});
            return res.json({ success: false, message: 'You are not a member of this group' });
        }

        if (name) group.name = name.slice(0, 80);

        if (avatar) {
            const fileBuffer = fs.readFileSync(avatar.path);
            const response = await uploadFile({
                fileBuffer,
                fileName: avatar.originalname,
                folder: 'groups/avatars',
                mimeType: avatar.mimetype,
            });

            await deleteS3File(group.avatar_id);
            group.avatar_url = response.url;
            group.avatar_id = response.fileId;

            fs.unlink(avatar.path, (err) => {
                if (err) console.log('Group avatar cleanup error:', err);
            });
        }

        await group.save();
        const populatedGroup = await populateGroup(GroupChat.findById(group._id).lean());
        await emitGroupUpdated(req, group._id);

        res.json({ success: true, message: 'Group chat updated', group: populatedGroup });
    } catch (error) {
        if (req.files?.avatar?.[0]?.path) fs.unlink(req.files.avatar[0].path, () => {});
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export const addGroupMembers = async (req, res) => {
    try {
        const userId = req.userId;
        const { groupId } = req.params;
        const memberIds = normalizeMemberIds(req.body['member_ids[]'] ?? req.body.member_ids);

        if (memberIds.length === 0) {
            return res.json({ success: false, message: 'Select at least one member' });
        }

        const group = await GroupChat.findById(groupId);
        if (!group) return res.json({ success: false, message: 'Group chat not found' });
        if (!isGroupMember(group, userId)) {
            return res.json({ success: false, message: 'You are not a member of this group' });
        }

        const currentMemberIds = new Set(getMemberIds(group));
        const newMemberIds = [...new Set(memberIds)]
            .filter((memberId) => memberId && !currentMemberIds.has(memberId));

        if (newMemberIds.length === 0) {
            return res.json({ success: false, message: 'All selected users are already members' });
        }

        const validMembers = await User.find({ _id: { $in: newMemberIds } }).select('_id').lean();
        const validMemberIds = new Set(validMembers.map((user) => user._id.toString()));
        if (validMemberIds.size < newMemberIds.length) {
            return res.json({ success: false, message: 'Some members were not found' });
        }

        group.members.push(...newMemberIds.map((id) => ({ user: id })));
        await group.save();

        const populatedGroup = await populateGroup(GroupChat.findById(group._id).lean());
        await emitGroupUpdated(req, group._id);

        res.json({ success: true, message: 'Members added', group: populatedGroup });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export const kickGroupMember = async (req, res) => {
    try {
        const userId = req.userId;
        const { groupId } = req.params;
        const { member_id } = req.body;

        const group = await GroupChat.findById(groupId);
        if (!group) return res.json({ success: false, message: 'Group chat not found' });
        if (group.creator.toString() !== userId) {
            return res.json({ success: false, message: 'Only the group creator can remove members' });
        }
        if (!member_id || member_id.toString() === userId.toString()) {
            return res.json({ success: false, message: 'Cannot remove this member' });
        }

        const wasMember = isGroupMember(group, member_id);
        if (!wasMember) return res.json({ success: false, message: 'Member not found in group' });

        group.members = group.members.filter((member) => getUserId(member.user) !== member_id.toString());
        await group.save();

        const populatedGroup = await populateGroup(GroupChat.findById(group._id).lean());
        const io = req.app.locals.io;
        if (io) {
            getMemberIds(populatedGroup).forEach((memberId) => {
                io.to(`user-${memberId}`).emit('group-chat-updated', populatedGroup);
            });
            io.to(`user-${member_id}`).emit('group-chat-removed', { groupId });
        }

        res.json({ success: true, message: 'Member removed', group: populatedGroup });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export const leaveGroupChat = async (req, res) => {
    try {
        const userId = req.userId;
        const { groupId } = req.params;

        const group = await GroupChat.findById(groupId);
        if (!group) return res.json({ success: false, message: 'Group chat not found' });
        if (!isGroupMember(group, userId)) {
            return res.json({ success: false, message: 'You are not a member of this group' });
        }

        const remainingMemberIds = getMemberIds(group).filter((memberId) => memberId !== userId.toString());
        const io = req.app.locals.io;

        if (remainingMemberIds.length === 0) {
            await GroupChat.deleteOne({ _id: group._id });
            if (io) io.to(`user-${userId}`).emit('group-chat-removed', { groupId, reason: 'left' });
            return res.json({ success: true, message: 'Left group', group: null });
        }

        group.members = group.members.filter((member) => getUserId(member.user) !== userId.toString());
        if (group.creator.toString() === userId.toString()) {
            group.creator = remainingMemberIds[0];
        }
        await group.save();

        const populatedGroup = await populateGroup(GroupChat.findById(group._id).lean());
        if (io) {
            getMemberIds(populatedGroup).forEach((memberId) => {
                io.to(`user-${memberId}`).emit('group-chat-updated', populatedGroup);
            });
            io.to(`user-${userId}`).emit('group-chat-removed', { groupId, reason: 'left' });
        }

        res.json({ success: true, message: 'Left group', group: populatedGroup });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};
