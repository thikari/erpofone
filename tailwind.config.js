/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/views/**/*.pug',
    './src/public/js/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:  ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono:  ['"JetBrains Mono"', '"Courier New"', 'monospace'],
      },
      colors: {
        sidebar: '#14162a',
        'main-bg': '#f3f4f8',
        brand: {
          teal:   '#14b8a6',
          amber:  '#f59e0b',
          blue:   '#3b82f6',
          purple: '#8b5cf6',
          green:  '#10b981',
          red:    '#ef4444',
        },
      },
      borderRadius: {
        DEFAULT: '8px',
        card:    '10px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
