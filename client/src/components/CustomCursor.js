import { useEffect } from 'react';

// Number of trail paw prints
const TRAIL_LENGTH = 8;

// SVG path for a simple paw print (main pad + 4 toe pads)
const PAW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <ellipse cx="12" cy="15" rx="4.5" ry="3.5"/>
  <ellipse cx="7.5" cy="10.5" rx="2" ry="2.5"/>
  <ellipse cx="16.5" cy="10.5" rx="2" ry="2.5"/>
  <ellipse cx="9" cy="7" rx="1.8" ry="2.2"/>
  <ellipse cx="15" cy="7" rx="1.8" ry="2.2"/>
</svg>`;

const CustomCursor = () => {
    useEffect(() => {
        // Skip on touch-only devices
        if (window.matchMedia('(pointer: coarse)').matches) return;

        // --- Build DOM nodes imperatively (zero React re-renders) ---
        const container = document.createElement('div');
        container.id = 'paw-cursor-root';
        container.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:999999;';
        document.body.appendChild(container);

        // Main paw cursor
        const mainPaw = document.createElement('div');
        mainPaw.className = 'paw-cursor-main';
        mainPaw.innerHTML = PAW_SVG;
        container.appendChild(mainPaw);

        // Trail paw prints pool
        const trailPaws = [];
        for (let i = 0; i < TRAIL_LENGTH; i++) {
            const paw = document.createElement('div');
            paw.className = 'paw-cursor-trail';
            paw.innerHTML = PAW_SVG;
            paw.style.opacity = '0';
            container.appendChild(paw);
            trailPaws.push({
                el: paw,
                x: -200,
                y: -200,
                opacity: 0,
                life: 0, // countdown timer (frames)
            });
        }

        // --- State ---
        let mouseX = -200;
        let mouseY = -200;
        let prevX = -200;
        let prevY = -200;
        let trailIndex = 0;
        let frameCount = 0;
        let isHovering = false;
        let isClicking = false;
        let isVisible = false;

        // Spawn a new trail dot every N frames only if cursor moved enough
        const SPAWN_INTERVAL = 4; // frames between spawns
        const MIN_DIST = 10; // minimum pixels moved before spawning

        const loop = () => {
            frameCount++;

            // Update main cursor position
            mainPaw.style.transform = `translate(${mouseX}px, ${mouseY}px) rotate(${isHovering ? '15deg' : '-15deg'}) scale(${isClicking ? 0.8 : isHovering ? 1.2 : 1})`;
            mainPaw.style.opacity = isVisible ? '1' : '0';
            mainPaw.style.color = isHovering ? '#b45309' : '#d97706';

            // Spawn trail paw at intervals if cursor moved
            const dx = mouseX - prevX;
            const dy = mouseY - prevY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (frameCount % SPAWN_INTERVAL === 0 && dist > MIN_DIST && isVisible) {
                const slot = trailPaws[trailIndex % TRAIL_LENGTH];
                // Alternate left/right offset like real pawsteps
                const side = trailIndex % 2 === 0 ? -1 : 1;
                // Perpendicular offset
                const angle = Math.atan2(dy, dx);
                const perpX = Math.sin(angle) * side * 6;
                const perpY = -Math.cos(angle) * side * 6;
                const rotate = (angle * 180 / Math.PI) + 90 + side * 20;

                slot.x = mouseX + perpX;
                slot.y = mouseY + perpY;
                slot.life = 40; // frames to live
                slot.rotate = rotate;
                trailIndex++;

                prevX = mouseX;
                prevY = mouseY;
            }

            // Update all trail dots
            trailPaws.forEach(slot => {
                if (slot.life > 0) {
                    slot.life--;
                    slot.opacity = slot.life / 40;
                    slot.el.style.transform = `translate(${slot.x}px, ${slot.y}px) rotate(${slot.rotate}deg)`;
                    slot.el.style.opacity = slot.opacity;
                } else {
                    slot.el.style.opacity = '0';
                }
            });

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);

        // --- Event listeners ---
        const onMouseMove = (e) => {
            if (!isVisible) isVisible = true;
            mouseX = e.clientX;
            mouseY = e.clientY;
        };

        const onMouseOver = (e) => {
            const target = e.target;
            isHovering = !!target.closest('a, button, input, select, textarea, .btn, [role="button"], label, .clickable');
        };

        const onMouseDown = () => { isClicking = true; };
        const onMouseUp = () => { isClicking = false; };

        window.addEventListener('mousemove', onMouseMove, { passive: true });
        window.addEventListener('mouseover', onMouseOver, { passive: true });
        window.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup', onMouseUp);
        document.body.classList.add('custom-cursor-enabled');

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseover', onMouseOver);
            window.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mouseup', onMouseUp);
            document.body.classList.remove('custom-cursor-enabled');
            if (container.parentNode) container.parentNode.removeChild(container);
        };
    }, []);

    // Render nothing — all DOM is managed imperatively above
    return null;
};

export default CustomCursor;
