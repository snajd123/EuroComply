/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // EuroComply Design System - Stitch Export
        // Elevated Palette: Deep Forest Green + Warm Sand/Off-White + Sharp Teal Accent
        primary: {
          DEFAULT: '#134e4a', // teal-900 equivalent base
          dark: '#0f3d39',
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        accent: '#2dd4bf', // teal-400
        secondary: '#e7e5e4', // stone-200
        'background-light': '#fafaf9', // stone-50
        'background-dark': '#0c0a09', // stone-950
        'text-main': '#1c1917', // stone-900
        'text-muted': '#57534e', // stone-600
        surface: {
          DEFAULT: '#ffffff',
          dark: '#1c1917',
        },
        // Semantic colors
        success: {
          50: '#f0fdf4',
          500: '#22c55e',
          600: '#16a34a',
        },
        warning: {
          50: '#fffbeb',
          500: '#f59e0b',
          600: '#d97706',
        },
        danger: {
          50: '#fef2f2',
          500: '#ef4444',
          600: '#dc2626',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 20px -2px rgba(19, 78, 74, 0.08)',
        card: '0 0 0 1px rgba(0,0,0,0.03), 0 8px 30px rgba(0,0,0,0.04)',
        glow: '0 0 40px -10px rgba(45, 212, 191, 0.3)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};
