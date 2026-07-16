import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...props
}) => {
  const baseStyle = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium cursor-pointer transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';
  
  const variants = {
    primary: 'bg-brand-highlight border border-brand-highlight-border-subtle text-brand-highlight-text hover:bg-brand-highlight-hover',
    secondary: 'bg-brand-card border border-brand-border text-brand-textMain hover:bg-brand-hover hover:border-brand-textMuted/30',
    ghost: 'bg-transparent border border-transparent text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover',
    danger: 'bg-[color:var(--neon-destructive)]/10 border border-[color:var(--neon-destructive)]/35 text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)] hover:text-white',
    link: 'bg-transparent border border-transparent p-0 text-brand-textMuted hover:text-white hover:underline active:scale-100'
  };

  const sizes = {
    sm: 'text-xs px-2.5 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-5 py-2.5'
  };

  return (
    <button
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
