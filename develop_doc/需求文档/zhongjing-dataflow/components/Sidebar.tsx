import React from 'react';
import { LayoutDashboard, Play, Rocket, Database, Settings, Moon, Sun } from 'lucide-react';

interface SidebarProps {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isDarkMode, toggleTheme }) => {
  const menuItems = [
    { icon: LayoutDashboard, label: '看板', active: false },
    { icon: Play, label: '执行', active: true },
    { icon: Rocket, label: '部署', active: false },
    { icon: Database, label: '数据中心', active: false },
  ];

  return (
    <div className="w-64 h-full bg-white dark:bg-[#0B0E14] border-r border-slate-200 dark:border-slate-800 flex flex-col flex-shrink-0 transition-colors duration-300">
      {/* Brand */}
      <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-slate-800/50">
        <span className="text-slate-900 dark:text-slate-100 font-extrabold text-xl tracking-tight truncate w-full">
          Zhongjing DataFlow
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.label}
            className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
              item.active
                ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
            }`}
          >
            <item.icon className={`w-5 h-5 mr-3 ${item.active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-500'}`} />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Settings & Theme Toggle (Bottom) */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800/50 space-y-1">
        <button 
          onClick={toggleTheme}
          className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50 rounded-md transition-colors"
        >
          {isDarkMode ? (
            <>
              <Sun className="w-5 h-5 mr-3 text-slate-500" />
              亮色模式
            </>
          ) : (
            <>
              <Moon className="w-5 h-5 mr-3 text-slate-500" />
              暗色模式
            </>
          )}
        </button>
        
        <button className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/50 rounded-md transition-colors">
          <Settings className="w-5 h-5 mr-3 text-slate-500" />
          设置
        </button>
      </div>
    </div>
  );
};