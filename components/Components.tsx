
import React from 'react';
import { LucideIcon, Loader2 } from 'lucide-react';

// --- Button ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'fab' | 'minimal';
  icon?: LucideIcon;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  icon: Icon, 
  isLoading,
  className = '',
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] tracking-tight font-medium";
  
  const variants = {
    // Swiss Primary: Solid, no shadow, sharp corners or moderate rounding
    primary: "px-6 py-3 rounded-lg bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600",
    // Swiss Secondary: Subtle background
    secondary: "px-6 py-3 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-100 hover:bg-surface-200 dark:hover:bg-surface-700",
    danger: "px-6 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100",
    ghost: "px-4 py-2 rounded-lg text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-50 dark:hover:bg-surface-800",
    minimal: "p-2 rounded-lg text-surface-500 hover:text-surface-900 dark:hover:text-white hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors",
    fab: "w-14 h-14 rounded-full bg-brand-600 dark:bg-brand-500 text-white shadow-lg hover:shadow-xl hover:scale-105 z-50",
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`} 
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : Icon ? (
        <Icon className={`${variant === 'fab' || variant === 'minimal' ? 'w-6 h-6' : 'w-4 h-4'} ${children ? 'mr-2' : ''}`} />
      ) : null}
      {children}
    </button>
  );
};

// --- Card ---
export const Card: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className = '', onClick }) => (
  <div 
    onClick={onClick}
    className={`bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 transition-all duration-300 ${onClick ? 'cursor-pointer' : ''} ${className}`}
  >
    {children}
  </div>
);

// --- Input ---
export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...props }) => (
  <input 
    className={`w-full px-4 py-3 rounded-lg bg-surface-50 dark:bg-surface-950 border border-surface-200 dark:border-surface-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all placeholder:text-surface-400 font-medium text-surface-900 dark:text-surface-100 ${className}`}
    {...props}
  />
);

// --- TextArea ---
export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className = '', ...props }) => (
  <textarea 
    className={`w-full px-0 py-4 bg-transparent border-none focus:ring-0 outline-none transition-all resize-none placeholder:text-surface-300 dark:placeholder:text-surface-600 ${className}`}
    {...props}
  />
);

// --- Modal ---
export const Modal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  children: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ isOpen, onClose, title, children, actions }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface-900/20 dark:bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-surface-900 rounded-xl max-w-lg w-full shadow-2xl p-8 animate-scale-in border border-surface-200 dark:border-surface-700">
        <h3 className="text-xl font-bold mb-4 text-surface-900 dark:text-white font-display tracking-tight">{title}</h3>
        <div className="text-surface-600 dark:text-surface-300 mb-8 leading-relaxed font-sans">
          {children}
        </div>
        <div className="flex justify-end space-x-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {actions}
        </div>
      </div>
    </div>
  );
};
