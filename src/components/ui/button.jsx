// src/components/ui/button.jsx
import * as React from "react";

const Button = React.forwardRef(
  ({ className = "", variant = "default", ...props }, ref) => {
    const baseStyle =
      "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
    const variants = {
      default: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
      outline: "border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 focus:ring-gray-500",
      secondary: "bg-gray-100 text-gray-800 hover:bg-gray-200 focus:ring-gray-400"
    };

    const selectedVariant = variants[variant] || variants.default;

    return (
      <button
        ref={ref}
        {...props}
        className={`${baseStyle} ${selectedVariant} ${className}`}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
