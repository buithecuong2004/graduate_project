import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import {BrowserRouter} from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { Provider } from 'react-redux'
import { store } from './app/store.js'
import moment from './utils/moment'

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <BrowserRouter>
      <StrictMode>
        <Provider store={store}>
          <App />
        </Provider>    
      </StrictMode>
    </BrowserRouter>
  </AuthProvider>
)
