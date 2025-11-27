import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines multiple class names with Tailwind CSS conflict resolution.
 * 
 * Merges class names using clsx for conditional classes,
 * then applies tailwind-merge to resolve Tailwind CSS conflicts
 * (e.g., later classes override earlier ones).
 * 
 * Features:
 * - Handles conditional classes via clsx
 * - Resolves Tailwind utility conflicts
 * - Supports strings, arrays, objects
 * - Filters falsy values automatically
 * 
 * @param inputs - Class values to combine (strings, objects, arrays)
 * @returns Merged class string with resolved conflicts
 * 
 * @example
 * ```tsx
 * // Basic usage
 * cn('px-4 py-2', 'bg-blue-500')
 * // => 'px-4 py-2 bg-blue-500'
 * 
 * // Conditional classes
 * cn('btn', isActive && 'btn-active', isDisabled && 'btn-disabled')
 * // => 'btn btn-active' (if isActive=true, isDisabled=false)
 * 
 * // Tailwind conflict resolution
 * cn('px-4', 'px-6')
 * // => 'px-6' (later padding wins)
 * 
 * // Object syntax
 * cn({ 'text-red-500': hasError, 'text-green-500': !hasError })
 * 
 * // Array syntax
 * cn(['base-class', variant === 'primary' && 'primary-class'])
 * 
 * // Component usage
 * <div className={cn('base-styles', className, isHovered && 'hover-styles')} />
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
