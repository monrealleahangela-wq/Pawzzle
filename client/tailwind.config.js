/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // UI Palette: Mocha and Brown
        primary: {
          DEFAULT: '#8B4513',
          50: '#FDF5F0',
          100: '#FBEBDD',
          200: '#F7D0B2',
          300: '#F3B587',
          400: '#EF9A5C',
          500: '#8B4513', // User Brown
          600: '#743A10',
          700: '#5D2E0D',
          800: '#46220A',
          900: '#2E1707',
          950: '#1A0B03',
        },
        secondary: {
          DEFAULT: '#BFA6A0',
          50: '#F9F7F6',
          100: '#F2EFED',
          200: '#E6DFDB',
          300: '#D9D0C9',
          400: '#CDC0B7',
          500: '#BFA6A0', // User Mocha
          600: '#A88F88',
          700: '#917871',
          800: '#7A6159',
          900: '#634A42',
          950: '#4A3731',
        },
        // Accents - Cream and Taupe
        accent: {
          light: '#FDF5F0', // Cream
          mocha: '#E3DAD7', // Light Mocha
          dark: '#5D2E0D', // Dark Brown
        },
        slate: {
          50: '#F9F8F8',
          100: '#F1EFEE',
          200: '#E2DFDD',
          300: '#D1CCCA',
          400: '#9B9491',
          500: '#766D6A',
          600: '#5E5653',
          700: '#46403E',
          800: '#2F2B2A',
          900: '#1B1918',
          950: '#0B0A09',
        },
        gray: {
          50: '#F9F8F8',
          100: '#F1EFEE',
          200: '#E2DFDD',
          300: '#D1CCCA',
          400: '#9B9491',
          500: '#766D6A',
          600: '#5E5653',
          700: '#46403E',
          800: '#2F2B2A',
          900: '#1B1918',
          950: '#0B0A09',
        },
        neutral: {
          50: '#FFFFFF',
          100: '#FBFBFA',
          200: '#F6F5F4',
          300: '#F0EFEF',
          400: '#E5E4E3',
          500: '#BBBBB8',
          600: '#766D6A',
          700: '#5E5653',
          800: '#2F2B2A',
          900: '#1B1918',
          950: '#0B0A09',
        },
        gradient: {
          start: '#8B4513', // Brown
          middle: '#BFA6A0', // Mocha
          end: '#5D2E0D', // Deep Brown
        },
        success: '#917871',
        warning: '#D9D0C9',
        error: '#8B4513',
        info: '#BFA6A0',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'hero-gradient': 'linear-gradient(135deg, #8B4513 0%, #BFA6A0 100%)',
        'card-gradient': 'linear-gradient(135deg, #FDF5F0 0%, #E3DAD7 100%)',
        'success-gradient': 'linear-gradient(135deg, #917871 0%, #766D6A 100%)',
        'warning-gradient': 'linear-gradient(135deg, #D9D0C9 0%, #B7A79F 100%)',
        'error-gradient': 'linear-gradient(135deg, #8B4513 0%, #743A10 100%)',
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(139, 69, 19, 0.07), 0 10px 20px -2px rgba(139, 69, 19, 0.04)',
        'medium': '0 4px 25px -5px rgba(139, 69, 19, 0.1), 0 10px 10px -5px rgba(139, 69, 19, 0.04)',
        'strong': '0 10px 40px -10px rgba(139, 69, 19, 0.15), 0 2px 10px -2px rgba(139, 69, 19, 0.04)',
        'premium': '0 25px 80px -15px rgba(139, 69, 19, 0.2), 0 10px 30px -10px rgba(0,0,0,0.05)',
        'hover': '0 30px 70px -10px rgba(139, 69, 19, 0.15), 0 20px 40px -20px rgba(0,0,0,0.1)',
        'glow': '0 0 20px rgba(191, 166, 160, 0.2)',
        'glow-brown': '0 0 20px rgba(139, 69, 19, 0.2)',
        'glow-mocha': '0 0 20px rgba(191, 166, 160, 0.2)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'bounce-soft': 'bounceSoft 2s infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        bounceSoft: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '200% 0%' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      screens: {
        'xs': '475px',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
    },
  },
  plugins: [],
}
