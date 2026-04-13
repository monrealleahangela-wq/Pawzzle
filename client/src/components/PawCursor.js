import React, { useEffect, useRef, useState } from 'react';
import { PawPrint } from 'lucide-react';

const PawCursor = () => {
    const cursorRef = useRef(null);
    const [isHovering, setIsHovering] = useState(false);
    const [isPressed, setIsPressed] = useState(false);
    const [isTouch, setIsTouch] = useState(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const distanceThreshold = 45;
    const maxTrail = 15; 

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
            const isClickable = target.closest('a, button, select, input, [role="button"], .clickable, .cursor-pointer');
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
            // High contrast color for trail (Semi-transparent cream)
            print.className = 'absolute pointer-events-none transition-all duration-1500 opacity-20 scale-50 ease-out';
            print.style.left = `${x + (side === 'left' ? -18 : 18)}px`;
            print.style.top = `${y}px`;
            print.style.transform = `translate(-50%, -50%) rotate(${angle + (side === 'left' ? -10 : 10)}deg)`;
            print.style.color = '#FBEBDD'; 
            print.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15.5c.34-.14.7-.22 1.08-.22.38 0 .74.08 1.08.22.6.24.96.84.96 1.5 0 1.1-.9 2-2 2s-2-.9-2-2c0-.66.36-1.26.96-1.5zM12 11c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zM4.5 13c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zM19.5 13c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zM8.5 7c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zM15.5 7c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z"/></svg>';
            
            trailContainer.appendChild(print);

            // Smooth fade out
            requestAnimationFrame(() => {
                setTimeout(() => {
                    print.style.opacity = '0';
                    print.style.transform = `translate(-50%, -50%) rotate(${angle}deg) scale(0.2)`;
                    setTimeout(() => print.remove(), 1000);
                }, 800);
            });

            // Limit trail length for memory
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
            <div id="paw-trail-container" className="absolute inset-0 pointer-events-none" />
            
            <div
                ref={cursorRef}
                className="absolute top-0 left-0 pointer-events-none"
                style={{ 
                    transform: 'translate3d(-100px, -100px, 0)',
                    transition: 'none',
                    willChange: 'transform',
                    zIndex: 999999
                }}
            >
                <div 
                    className="relative"
                    style={{ 
                        transform: 'translate(-50%, -35%)', 
                        transition: 'transform 0.1s ease-out'
                    }}
                >
                    <div 
                        className="flex items-center justify-center"
                        style={{
                            transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), color 0.3s ease',
                            transform: `scale(${isPressed ? 0.7 : isHovering ? 1.4 : 1.0})`,
                            // Vanilla/Cream color for maximum visibility against brown theme
                            color: isHovering ? '#FB923C' : '#FBEBDD' 
                        }}
                    >
                        <div className={`relative transition-all duration-300 ${isHovering ? 'rotate-[15deg]' : 'rotate-0'}`}>
                            <PawPrint 
                                size={26} 
                                fill="currentColor" 
                                className={`filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] ${isHovering ? 'opacity-100' : 'opacity-90'}`} 
                            />
                            {isHovering && (
                                <div className="absolute inset-0 bg-orange-400/40 blur-2xl rounded-full -z-10 animate-pulse" />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PawCursor;
