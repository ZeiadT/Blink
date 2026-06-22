import React from 'react';
import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  iconPosition = 'left',
  fullWidth = false,
  disabled,
  children,
  className = '',
  ...rest
}) => {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
    loading ? styles.loading : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 size={iconSize} className={styles.spinner} />}
      {!loading && Icon && iconPosition === 'left' && (
        <Icon size={iconSize} className={styles.icon} />
      )}
      {children && <span className={styles.label}>{children}</span>}
      {!loading && Icon && iconPosition === 'right' && (
        <Icon size={iconSize} className={styles.icon} />
      )}
    </button>
  );
};
