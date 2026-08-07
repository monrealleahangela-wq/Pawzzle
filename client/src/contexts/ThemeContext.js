import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    // Check local storage or system preference
    const savedTheme = localStorage.getItem('pawzzle-theme');
    if (savedTheme) return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    
    // Remove old theme
    root.classList.remove('light', 'dark');
    
    // Add new theme
    root.classList.add(theme);
    root.style.colorScheme = theme;
    
    // Save to local storage
    localStorage.setItem('pawzzle-theme', theme);
  }, [theme]);

  useEffect(() => {
    const syncTheme = (event) => {
      if (event.key === 'pawzzle-theme' && ['light', 'dark'].includes(event.newValue)) {
        setTheme(event.newValue);
      }
    };
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
