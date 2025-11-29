
import { cn } from "@/lib/utils";
import { CSSProperties, ReactNode } from "react";

type TypoProps = {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  [key: string]: unknown; // Accept any other props
};

export function H1({ children, className, style, ...rest }: TypoProps) {
  return (
    <h1
      className={cn("scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance", className)}
      style={style}
      {...rest}
    >
      {children}
    </h1>
  );
}

export function H2({ children, className, style, ...rest }: TypoProps) {
  return (
    <h2
      className={cn("scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0", className)}
      style={style}
      {...rest}
    >
      {children}
    </h2>
  );
}

export function H3({ children, className, style, ...rest }: TypoProps) {
  return (
    <h3
      className={cn("scroll-m-20 text-2xl font-semibold tracking-tight", className)}
      style={style}
      {...rest}
    >
      {children}
    </h3>
  );
}

export function H4({ children, className, style, ...rest }: TypoProps) {
  return (
    <h4
      className={cn("scroll-m-20 text-xl font-semibold tracking-tight", className)}
      style={style}
      {...rest}
    >
      {children}
    </h4>
  );
}

export function P({ children, className, style, ...rest }: TypoProps) {
  return (
    <p
      className={cn("leading-7 not-first:mt-6", className)}
      style={style}
      {...rest}
    >
      {children}
    </p>
  );
}

export function Blockquote({ children, className, style, ...rest }: TypoProps) {
  return (
    <blockquote
      className={cn("mt-6 border-l-2 pl-6 italic", className)}
      style={style}
      {...rest}
    >
      {children}
    </blockquote>
  );
}

export function Code({ children, className, style, ...rest }: TypoProps) {
  return (
    <code
      className={cn("rounded bg-muted px-1 py-0.5 font-mono text-sm", className)}
      style={style}
      {...rest}
    >
      {children}
    </code>
  );
}

export function Muted({ children, className, style, ...rest }: TypoProps) {
  return (
    <p
      className={cn("text-muted-foreground text-sm", className)}
      style={style}
      {...rest}
    >
      {children}
    </p>
  );
}

export function Small({ children, className, style, ...rest }: TypoProps) {
  return (
    <small
      className={cn("text-sm leading-none font-medium", className)}
      style={style}
      {...rest}
    >
      {children}
    </small>
  );
}

export function Large({ children, className, style, ...rest }: TypoProps) {
  return (
    <div
      className={cn("text-lg font-semibold", className)}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Lead({ children, className, style, ...rest }: TypoProps) {
  return (
    <p
      className={cn("text-muted-foreground text-xl", className)}
      style={style}
      {...rest}
    >
      {children}
    </p>
  );
}
