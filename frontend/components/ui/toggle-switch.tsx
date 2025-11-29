"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import * as Typo from "@/components/ui/typography";

/**
 * Configuration for toggle state appearance.
 * 
 * @property icon - Text or icon to display in the knob
 * @property color - Background color for the knob (Tailwind color class)
 * @property bgColor - Background color for the layer (Tailwind color class)
 * @property textColor - Text/icon color for the knob (Tailwind color class, defaults to "text-white")
 * @property tooltip - Optional tooltip text to display on hover
 */
export interface ToggleState {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  textColor?: string;
  tooltip?: string;
}

export interface ToggleSwitchProps {
  /** Configuration for unchecked state */
  before: ToggleState;
  /** Configuration for checked state */
  after: ToggleState;
  /** Current checked state */
  checked?: boolean;
  /** Callback when toggle state changes */
  onCheckedChange?: (checked: boolean) => void;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Accessible label for screen readers */
  "aria-label"?: string;
}

/**
 * Animated toggle switch component with customizable states.
 * 
 * Features:
 * - Smooth animations using Tailwind transitions
 * - Customizable icons and colors for both states
 * - Accessible with proper ARIA attributes
 * - Keyboard navigation support
 * - Disabled state handling
 * 
 * @example
 * ```tsx
 * // Simple Yes/No toggle
 * <ToggleSwitch
 *   before={{ icon: "YES", color: "bg-blue-500", bgColor: "bg-blue-50" }}
 *   after={{ icon: "NO", color: "bg-red-500", bgColor: "bg-red-50" }}
 *   checked={isEnabled}
 *   onCheckedChange={setIsEnabled}
 *   aria-label="Enable feature"
 * />
 * 
 * // With Lucide icons and tooltips
 * <ToggleSwitch
 *   before={{ 
 *     icon: <Volume2 className="size-3" />, 
 *     color: "bg-green-500", 
 *     bgColor: "bg-green-50",
 *     textColor: "text-white",
 *     tooltip: "Sound on"
 *   }}
 *   after={{ 
 *     icon: <VolumeX className="size-3" />, 
 *     color: "bg-gray-500", 
 *     bgColor: "bg-gray-50",
 *     textColor: "text-gray-900",
 *     tooltip: "Sound muted"
 *   }}
 *   checked={isMuted}
 *   onCheckedChange={setIsMuted}
 * />
 * ```
 */
export const ToggleSwitch = React.forwardRef<HTMLInputElement, ToggleSwitchProps>(
  (
    {
      before,
      after,
      checked = false,
      onCheckedChange,
      disabled = false,
      className,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!disabled) {
        onCheckedChange?.(e.target.checked);
      }
    };

    const currentState = checked ? after : before;

    const toggleContent = (
      <div
        className={cn(
          "relative inline-block w-24 h-9 overflow-hidden select-none",
          disabled && "opacity-90 cursor-not-allowed",
          className
        )}
      >
        {/* Hidden checkbox for accessibility */}
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          aria-label={ariaLabel}
          className="absolute inset-0 w-full h-full p-0 m-0 opacity-0 cursor-pointer z-30 disabled:cursor-not-allowed"
          {...props}
        />

        {/* Animated knob with icon */}
        <div className="absolute inset-0 z-20 pointer-events-none">
          <div
            className={cn(
              "absolute w-12 h-full flex items-center justify-center",
              "text-sm font-medium rounded-full [&>svg]:size-5",
              "transition-all duration-200 ease-in-out",
              currentState.color,
              currentState.textColor || "text-white",
              checked ? "left-12" : "left-0"
            )}
          >
            {currentState.icon}
          </div>
        </div>

        {/* Background layer */}
        <div
          className={cn(
            "absolute inset-0 w-full h-full rounded-full z-10",
            "transition-all duration-200 ease-in-out",
            currentState.bgColor
          )}
        />
      </div>
    );

    // If current state has a tooltip, wrap in Tooltip component
    if (currentState.tooltip) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            {toggleContent}
          </TooltipTrigger>
          <TooltipContent>
            <Typo.P>{currentState.tooltip}</Typo.P>
          </TooltipContent>
        </Tooltip>
      );
    }

    return toggleContent;
  }
);

ToggleSwitch.displayName = "ToggleSwitch";
