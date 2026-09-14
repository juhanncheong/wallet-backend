// src/components/ui/input.jsx
import * as React from "react";

const Input = React.forwardRef(({ className = "", type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      ref={ref}
      {...props}
      className={`w-full bg-white text-black dark:bg-gray-800 dark:text-white border dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded px-3 py-2 ${className}`}
    />
  );
});

Input.displayName = "Input";

export { Input };
