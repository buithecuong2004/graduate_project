import React from 'react'
import { menuItemsData } from '../assets/assets'
import { NavLink } from 'react-router-dom'

const MenuItems = ({ setSidebarOpen }) => {
  return (
    <div className='px-4 text-slate-600 space-y-1.5 font-semibold'>
      {
        menuItemsData.map((item) => {
          const MenuIcon = item.Icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `px-4 py-3 flex items-center gap-3 rounded-2xl transition ${
                  isActive
                    ? 'bg-cyan-50 text-cyan-700 shadow-sm ring-1 ring-cyan-100'
                    : 'hover:bg-slate-100 hover:text-slate-950'
                }`
              }
            >
              <MenuIcon className='w-5 h-5'/>
              {item.label}
            </NavLink>
          )
        })
      }
    </div>
  )
}

export default MenuItems
