/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class', // ✅ Enables dark mode using class
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'], // ✅ Custom font
      },
    },
  },
  plugins: [],
}
