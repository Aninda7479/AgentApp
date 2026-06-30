import React from 'react';

interface AppToastProps {
  open: boolean;
  message: string;
}

export const AppToast: React.FC<AppToastProps> = ({ open, message }) => {
  if (!open) return null;

  return (
    <div
      data-testid="toast-under-construction"
      className="fixed bottom-6 right-6 bg-brand-popover border border-brand-border rounded-lg py-3 px-4 text-brand-textMain shadow-2xl z-[3000] flex items-center gap-2 text-xs"
    >
      <span>!</span>
      <span>{message} is currently under development.</span>
    </div>
  );
};
