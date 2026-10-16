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

export function SwapIcon() {
    return <Icon><path d="M7 15.5V4.5M3.75 7.75L7 4.5l3.25 3.25M13 4.5v11M9.75 12.25L13 15.5l3.25-3.25" /></Icon>;
}
