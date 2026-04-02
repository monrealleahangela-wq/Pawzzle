import React, { useEffect, useRef, useState } from 'react';
import { PawPrint } from 'lucide-react';

const CustomCursor = () => {
    const cursorRef = useRef(null);
    const ringRef = useRef(null);
    const [isVisible, setIsVisible] = useState(false);
    
    useEffect(() => {
        // Disable strictly on touch devices
        if (window.matchMedia('(pointer: coarse)').matches) return;

        let mouseX = -100;
        let mouseY = -100;
        let ringX = -100;
        let ringY = -100;

        const loop = () => {
            // Smooth trailing effect for the ring structure
            ringX += (mouseX - ringX) * 0.2;
            ringY += (mouseY - ringY) * 0.2;
            
            if (cursorRef.current) {
                cursorRef.current.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
            }
            if (ringRef.current) {
                ringRef.current.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);

        const onMouseMove = (e) => {
            if (!isVisible) setIsVisible(true);
            mouseX = e.clientX;
            mouseY = e.clientY;
        };

        const updateHoverState = (e) => {
            if (!cursorRef.current || !ringRef.current) return;
            const target = e.target;
            const isClickable = target.closest('a, button, input, select, textarea, .btn, [role="button"], label, .clickable');
            
            if (isClickable) {
                cursorRef.current.classList.add('hovering');
                ringRef.current.classList.add('hovering');
            } else {
                cursorRef.current.classList.remove('hovering');
                ringRef.current.classList.remove('hovering');
            }
        };

        const handleMouseDown = () => {
            if (cursorRef.current) cursorRef.current.classList.add('clicked');
            if (ringRef.current) ringRef.current.classList.add('clicked');
        };
        const handleMouseUp = () => {
            if (cursorRef.current) cursorRef.current.classList.remove('clicked');
            if (ringRef.current) ringRef.current.classList.remove('clicked');
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseover', updateHoverState);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        
        document.body.classList.add('custom-cursor-enabled');

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseover', updateHoverState);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.classList.remove('custom-cursor-enabled');
        };
    }, [isVisible]);

    // Ensure SSR safety and touch device fallback
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
        return null;
    }

    return (
        <>
            <div 
                ref={cursorRef} 
                className={`custom-cursor-dot ${!isVisible ? 'opacity-0' : 'opacity-100'}`}
            >
                <div className="paw-wrapper">
                   <PawPrint className="w-5 h-5 text-primary-500 drop-shadow-md" fill="currentColor" />
                </div>
            </div>
            <div 
                ref={ringRef} 
                className={`custom-cursor-ring ${!isVisible ? 'opacity-0' : 'opacity-100'}`}
            />
        </>
    );
};

export default CustomCursor;
