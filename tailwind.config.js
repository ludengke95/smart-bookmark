/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './entrypoints/**/*.{html,ts,js,svelte}',
    './components/**/*.{html,ts,js,svelte}',
    './src/**/*.{html,ts,js,svelte}',
  ],
  darkMode: ['selector', '[data-theme="obsidian-dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Segoe UI"',
          'Roboto',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: [
          '"SF Mono"',
          '"JetBrains Mono"',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Courier New"',
          'monospace',
        ],
      },
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        'surface-hover': 'var(--bg-surface-hover)',
        subtle: 'var(--bg-subtle)',
        'border-subtle': 'var(--border-subtle)',
        'border-focus': 'var(--border-focus)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        'status-intranet': 'var(--status-intranet)',
        'status-extranet': 'var(--status-extranet)',
        'status-warn': 'var(--status-warn)',
        'status-danger': 'var(--status-danger)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        popover: 'var(--shadow-popover)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
    },
  },
  plugins: [],
};
