import React, { useEffect, useRef, useState } from 'react';
import { PawPrint } from 'lucide-react';

const PawCursor = () => {
    const cursorRef = useRef(null);
    const [isHovering, setIsHovering] = useState(false);
    const [isPressed, setIsPressed] = useState(false);
    const [isTouch, setIsTouch] = useState(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const distanceThreshold = 60;
    const maxTrail = 8; // Slightly fewer for better performance

    useEffect(() => {
        // Detect touch device
        setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);

        const cursor = cursorRef.current;
        if (!cursor) return;

        const handleMouseMove = (e) => {
            const { clientX, clientY } = e;
            
            // Direct DOM update for instant response
            requestAnimationFrame(() => {
                if (cursor) {
                    cursor.style.transform = `translate3d(${clientX}px, ${clientY}px, 0)`;
                }
            });

            // Detect hover
            const target = e.target;
            const isClickable = target.closest('a, button, select, input, [role="button"], .clickable');
            setIsHovering(!!isClickable);

            // Trail Logic
            const dist = Math.sqrt(
                Math.pow(clientX - lastPos.current.x, 2) + 
                Math.pow(clientY - lastPos.current.y, 2)
            );

            if (dist > distanceThreshold) {
                dropTrail(clientX, clientY, lastPos.current);
                lastPos.current = { x: clientX, y: clientY };
            }
        };

        const dropTrail = (x, y, prevPos) => {
            const angle = Math.atan2(y - prevPos.y, x - prevPos.x) * (180 / Math.PI) + 90;
            const side = Math.random() > 0.5 ? 'left' : 'right';
            
            const trailContainer = document.getElementById('paw-trail-container');
            if (!trailContainer) return;

            const print = document.createElement('div');
            print.className = 'absolute pointer-events-none transition-all duration-1000 opacity-30 scale-50 ease-out';
            print.style.left = `${x + (side === 'left' ? -15 : 15)}px`;
            print.style.top = `${y}px`;
            print.style.transform = `translate(-50%, -50%) rotate(${angle + (side === 'left' ? -15 : 15)}deg)`;
            print.style.color = '#713f12';
            print.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15.5c.34-.14.7-.22 1.08-.22.38 0 .74.08 1.08.22.6.24.96.84.96 1.5 0 1.1-.9 2-2 2s-2-.9-2-2c0-.66.36-1.26.96-1.5zM12 11c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zM4.5 13c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zM19.5 13c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zM8.5 7c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zM15.5 7c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z"/></svg>';
            
            trailContainer.appendChild(print);

            // Fade and remove
            setTimeout(() => {
                print.style.opacity = '0';
                print.style.transform = `translate(-50%, -50%) rotate(${angle}deg) scale(0.3)`;
                setTimeout(() => print.remove(), 1000);
            }, 600);

            // Cleanup old ones if too many
            if (trailContainer.children.length > maxTrail) {
                const oldest = trailContainer.children[0];
                if (oldest) oldest.remove();
            }
        };

        const handleMouseDown = () => setIsPressed(true);
        const handleMouseUp = () => setIsPressed(false);

        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    if (isTouch) return null;

    return (
        <div className="fixed inset-0 pointer-events-none z-[999999] overflow-hidden">
            <div id="paw-trail-container" className="absolute inset-0" />
            
            <div
                ref={cursorRef}
                className="absolute top-0 left-0 will-change-transform"
                style={{ 
                    transform: 'translate3d(-100px, -100px, 0)',
                    transition: 'none' 
                }}
            >
                {/* Offset Container: Aligns the 'toe' of the paw to the mouse point (Top-Center) */}
                <div 
                    className="relative"
                    style={{ 
                        transform: 'translate(-50%, -10%)', // Tip-aligned instead of center-aligned
                        transition: 'none'
                    }}
                >
                    <div 
                        className="transition-transform duration-200 ease-out flex items-center justify-center"
                        style={{
                            transform: `scale(${isPressed ? 0.7 : isHovering ? 1.2 : 1})`,
                            color: isHovering ? '#c2410c' : '#533114'
                        }}
                    >
                        <div className={`relative transition-transform duration-300 ${isHovering ? 'rotate-[15deg]' : 'rotate-0'}`}>
                            <PawPrint 
                                size={22} 
                                fill="currentColor" 
                                className={`filter drop-shadow-[0_2px_3px_rgba(0,0,0,0.3)] transition-opacity duration-200 ${isHovering ? 'opacity-90' : 'opacity-100'}`} 
                            />
                            {isHovering && (
                                <div className="absolute inset-0 bg-primary-400/40 blur-xl rounded-full -z-10 animate-pulse" />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PawCursor;
