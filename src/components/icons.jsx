// Small stroke icons drawn on a 20px grid, sized by the surrounding font

function Icon({ children }) {
    return (
        <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            {children}
        </svg>
    );
}

export function CloseIcon() {
    return <Icon><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></Icon>;
}

export function SunIcon() {
    return <Icon><circle cx="10" cy="10" r="3.5" /><path d="M10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.3 4.3l1.1 1.1M14.6 14.6l1.1 1.1M4.3 15.7l1.1-1.1M14.6 5.4l1.1-1.1" /></Icon>;
}

export function MoonIcon() {
    return <Icon><path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7z" /></Icon>;
}

export function SwapIcon() {
    return <Icon><path d="M7 15.5V4.5M3.75 7.75L7 4.5l3.25 3.25M13 4.5v11M9.75 12.25L13 15.5l3.25-3.25" /></Icon>;
}
