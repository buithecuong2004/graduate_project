// SocketContext.jsx
import React, { createContext, useContext, useRef, useState } from 'react'

const SocketContext = createContext(null)

export const SocketProvider = ({ children }) => {
    const socketRef = useRef(null)
    const [incomingCall, setIncomingCall] = useState(null)

    return (
        <SocketContext.Provider value={{
            socketRef,
            incomingCall, setIncomingCall,
        }}>
            {children}
        </SocketContext.Provider>
    )
}

export const useSocket = () => useContext(SocketContext)