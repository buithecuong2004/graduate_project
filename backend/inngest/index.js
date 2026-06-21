import { Inngest } from "inngest";
import User from "../models/User.js";
import Connection from "../models/Connection.js";
import sendEmail from "../configs/nodeMailer.js";
import Story from "../models/Story.js";
import Message from "../models/Message.js";
import { deleteFile } from "../configs/storage.js";
import { getFrontendUrl } from "../utils/appUrl.js";

export const inngest = new Inngest({ id: "tarous-app" });

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
})[char]);

// Inngest Function to send Reminder when a new connection request is added
const sendNewConnectionRequestReminder = inngest.createFunction(
    {
        id: "send-new-connection-request-reminder",
        triggers: [{ event: "app/connection-request" }]
    },
    async ({ event, step }) => {
        const { connectionId } = event.data;

        const generateEmailBody = (connection) => {
            const recipientName = escapeHtml(connection.to_user_id.full_name || connection.to_user_id.username || 'bạn');
            const requesterName = escapeHtml(connection.from_user_id.full_name || connection.from_user_id.username || 'Một người dùng');
            const requesterUsername = connection.from_user_id.username
                ? ` - @${escapeHtml(connection.from_user_id.username)}`
                : '';

            return `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Xin chào ${recipientName},</h2>
                <p>${requesterName}${requesterUsername} vừa gửi cho bạn lời mời kết bạn trên Tarous.</p>
                <p>
                    Nhấn <a href="${getFrontendUrl('/connections')}" style="color: #10b981;">
                    vào đây</a> để chấp nhận hoặc từ chối lời mời.
                </p>
                <br/>
                <p>Trân trọng,<br/>Tarous - Luôn kết nối</p>
            </div>
            `;
        };

        await step.run('send-connection-request-mail', async () => {
            const connection = await Connection
                .findById(connectionId)
                .populate('from_user_id to_user_id');

            if (!connection) return;

            if (connection.status === 'accepted') {
                return { message: 'Already accepted' };
            }

            await sendEmail({
                to: connection.to_user_id.email,
                subject: 'Bạn có lời mời kết bạn mới',
                body: generateEmailBody(connection)
            });
        });

        const in24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await step.sleepUntil("wait-for-24-hours", in24Hours);

        await step.run('send-connection-request-reminder', async () => {
            const connection = await Connection
                .findById(connectionId)
                .populate('from_user_id to_user_id');

            if (!connection) return;

            if (connection.status === 'accepted') {
                return { message: 'Already accepted' };
            }

            await sendEmail({
                to: connection.to_user_id.email,
                subject: 'Nhắc nhở: Bạn có lời mời kết bạn đang chờ',
                body: generateEmailBody(connection)
            });

            return { message: 'Reminder sent' };
        });
    }
);

const deleteStory = inngest.createFunction(
    {
        id: "story-delete",
        triggers: [{ event: "app/story.delete" }]
    },
    async ({ event, step }) => {
        const { storyId } = event.data
        const in24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000)
        await step.sleepUntil('wait-for-24-hours', in24Hours)
        await step.run("delete-story", async () => {
            const story = await Story.findById(storyId)

            // Delete media file from S3 if it exists
            if (story && story.media_id) {
                try {
                    await deleteFile(story.media_id)
                } catch (error) {
                    console.log('S3 delete error:', error.message)
                }
            }

            await Story.findByIdAndDelete(storyId)
            return { message: "Story deleted" }
        })
    }
)

const sendNotificationOfUnseenMessages = inngest.createFunction(
    {
        id: "seen-unseen-messages-notification",
        cron: "TZ=Asia/Ho_Chi_Minh 0 9 * * *"
    },
    async () => {
        const messages = await Message.find({ seen: false })
            .populate('to_user_id')

        const unseenCount = {}

        messages.forEach(message => {
            const user = message.to_user_id
            const id = user._id.toString()

            if (!unseenCount[id]) {
                unseenCount[id] = {
                    count: 0,
                    user
                }
            }

            unseenCount[id].count++
        })

        for (const userId in unseenCount) {
            const { count, user } = unseenCount[userId]

            const subject = `You have ${count} unseen messages`

            const body = `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Hi ${user.full_name},</h2>
                    <p>You have ${count} unseen messages</p>
                    <p>
                        Click <a href="${getFrontendUrl('/messages')}" style="color: #10b981">
                        here</a> to view them
                    </p>
                    <br/>
                    <p>Thanks,<br/>Tarous - Stay Connected</p>
                </div>
            `

            try {
                await sendEmail({
                    to: user.email,
                    subject,
                    body
                })
            } catch (err) {
                console.log("Email error:", err)
            }
        }

        return { message: "Notification sent" }
    }
)

// EXPORT — removed Clerk sync functions (syncUserCreation, syncUserUpdation, syncUserDeletion)
export const functions = [
    sendNewConnectionRequestReminder,
    deleteStory,
    sendNotificationOfUnseenMessages
];
