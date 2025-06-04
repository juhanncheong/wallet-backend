// src/components/ui/select.jsx
import React from 'react';

export const Select = ({ children, onValueChange }) => {
  return (
    <select
      onChange={(e) => onValueChange(e.target.value)}
      className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {children}
    </select>
  );
};

export const SelectTrigger = ({ children }) => {
  return <>{children}</>;
};

export const SelectValue = ({ placeholder }) => {
  return <option disabled selected>{placeholder}</option>;
};

export const SelectContent = ({ children }) => {
  return <>{children}</>;
};

export const SelectItem = ({ value, children }) => {
  return <option value={value}>{children}</option>;
};
