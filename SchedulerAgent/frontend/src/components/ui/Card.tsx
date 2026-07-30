import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  onClick,
  hoverable = false,
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-[#0d1220] border border-white/5 rounded-2xl p-6 shadow-xl ${
        hoverable ? 'hover:border-indigo-500/40 hover:scale-[1.01] transition duration-200 cursor-pointer' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};
