import React, { useState, useEffect, useRef } from 'react';
import { PawPrint } from 'lucide-react';

const PawCursor = () => {
    const [mousePos, setMousePos] = useState({ x: -100, y: -100 });
    const [pawPrints, setPawPrints] = useState([]);
    const [isHovering, setIsHovering] = useState(false);
    const [isPressed, setIsPressed] = useState(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const distanceThreshold = 60; // Distance to travel before dropping another print

    useEffect(() => {
        const handleMouseMove = (e) => {
            const { clientX, clientY } = e;
            setMousePos({ x: clientX, y: clientY });

            // Detect if hovering over clickable elements
            const target = e.target;
            const isClickable = target.closest('a, button, select, input, [role="button"], .clickable');
            setIsHovering(!!isClickable);

            // Calculate distance from last paw print
            const dist = Math.sqrt(
                Math.pow(clientX - lastPos.current.x, 2) + 
                Math.pow(clientY - lastPos.current.y, 2)
            );

            if (dist > distanceThreshold) {
                const angle = Math.atan2(clientY - lastPos.current.y, clientX - lastPos.current.x) * (180 / Math.PI) + 90;
                
                const newPrint = {
                    id: Date.now(),
                    x: clientX,
                    y: clientY,
                    angle: angle,
                    side: Math.random() > 0.5 ? 'left' : 'right' // Alternate paws
                };

                setPawPrints(prev => [...prev.slice(-12), newPrint]); // Keep last 12 prints
                lastPos.current = { x: clientX, y: clientY };
            }
        };

        const handleMouseDown = () => setIsPressed(true);
        const handleMouseUp = () => setIsPressed(false);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            setPawPrints(prev => prev.filter(p => Date.now() - p.id < 2000));
        }, 100);
        return () => clearInterval(timer);
    }, []);

    // Hide default cursor globally
    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `
            * {
                cursor: none !important;
            }
            a, button, select, input, [role="button"] {
                cursor: none !important;
            }
        `;
        document.head.appendChild(style);
        return () => document.head.removeChild(style);
    }, []);

    return (
        <div className="fixed inset-0 pointer-events-none z-[99999] overflow-hidden">
            {/* Trail */}
            {pawPrints.map(print => (
                <div
                    key={print.id}
                    className="absolute transition-opacity duration-1000 opacity-30 scale-75"
                    style={{
                        left: print.x + (print.side === 'left' ? -10 : 10),
                        top: print.y,
                        transform: `translate(-50%, -50%) rotate(${print.angle + (print.side === 'left' ? -15 : 15)}deg)`,
                        color: '#713f12' // primary-900 equivalent
                    }}
                >
                    <PawPrint size={14} fill="currentColor" />
                </div>
            ))}

            {/* Main Cursor Container */}
            <div
                className="absolute flex items-center justify-center transition-all duration-150 ease-out"
                style={{
                    left: mousePos.x,
                    top: mousePos.y,
                    transform: `translate(-50%, -50%) scale(${isPressed ? 0.8 : isHovering ? 1.4 : 1})`,
                    color: isHovering ? '#c2410c' : '#533114' // primary-700 or dark brown
                }}
            >
                <div className={`relative transition-transform duration-300 ${isHovering ? 'rotate-12' : ''}`}>
                    <PawPrint 
                        size={28} 
                        fill="currentColor" 
                        className={`filter drop-shadow-md transition-all ${isHovering ? 'opacity-90' : 'opacity-100'}`} 
                    />
                    
                    {/* Hover Glow */}
                    {isHovering && (
                        <div className="absolute inset-0 bg-primary-400/20 blur-xl rounded-full -z-10 animate-pulse" />
                    )}
                </div>
            </div>
        </div>
    );
};

export default PawCursor;
