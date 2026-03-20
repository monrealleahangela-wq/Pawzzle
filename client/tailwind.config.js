/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // UI Palette from user image
        primary: {
          50: '#F5F2F0',
          100: '#ECE6E1',
          200: '#D1C2B5',
          300: '#B79F8A',
          400: '#9C7C5F',
          500: '#724E31',
          600: '#533114', // Base Deep Brown
          700: '#422710',
          800: '#311D0C',
          900: '#211308',
          950: '#100A04',
        },
        // Secondary - Muted Rose/Taupe
        secondary: {
          50: '#F6F4F3',
          100: '#EDE9E7',
          200: '#DBD3CF',
          300: '#C9BDB7',
          400: '#B7A79F',
          500: '#A08B80', // Base Muted Rose
          600: '#806F66',
          700: '#60534D',
          800: '#403733',
          900: '#201B19',
          950: '#100D0C',
        },
        // Overriding Slate and Gray to match the and Grey from image
        slate: {
          50: '#F9F9F9',
          100: '#F3F3F3',
          200: '#E5E5E5',
          300: '#D1D1D1',
          400: '#9C9C9C',
          500: '#797878', // Medium Grey
          600: '#5F5F5F',
          700: '#454545',
          800: '#2E2D2D', // Charcoal
          900: '#1A1A1A',
          950: '#010000', // Pure Black
        },
        gray: {
          50: '#F9F9F9',
          100: '#F3F3F3',
          200: '#E5E5E5',
          300: '#D1D1D1',
          400: '#9C9C9C',
          500: '#797878',
          600: '#5F5F5F',
          700: '#454545',
          800: '#2E2D2D',
          900: '#1A1A1A',
          950: '#010000',
        },
        neutral: {
          50: '#FFFFFF',
          100: '#FBFBFB',
          200: '#F7F7F7',
          300: '#F0F0F0',
          400: '#E0E0E0',
          500: '#BDBDBD',
          600: '#797878',
          700: '#5F5F5F',
          800: '#2E2D2D',
          900: '#1A1A1A',
          950: '#010000',
        },
        gradient: {
          start: '#533114',
          middle: '#A08B80',
          end: '#2E2D2D',
        },
        success: '#60534D',
        warning: '#B7A79F',
        error: '#533114',
        info: '#A08B80',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'hero-gradient': 'linear-gradient(135deg, #8b5a3c 0%, #6b4423 100%)',
        'card-gradient': 'linear-gradient(135deg, #d4b89a 0%, #b89a6c 100%)',
        'success-gradient': 'linear-gradient(135deg, #5a5a43 0%, #4a4a36 100%)',
        'warning-gradient': 'linear-gradient(135deg, #8b8b6a 0%, #6b6b52 100%)',
        'error-gradient': 'linear-gradient(135deg, #6b4423 0%, #5a3a1c 100%)',
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(83, 49, 20, 0.07), 0 10px 20px -2px rgba(83, 49, 20, 0.04)',
        'medium': '0 4px 25px -5px rgba(83, 49, 20, 0.1), 0 10px 10px -5px rgba(83, 49, 20, 0.04)',
        'strong': '0 10px 40px -10px rgba(83, 49, 20, 0.15), 0 2px 10px -2px rgba(83, 49, 20, 0.04)',
        'glow': '0 0 20px rgba(160, 139, 128, 0.2)',
        'glow-brown': '0 0 20px rgba(83, 49, 20, 0.2)',
        'glow-taupe': '0 0 20px rgba(160, 139, 128, 0.2)',
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
