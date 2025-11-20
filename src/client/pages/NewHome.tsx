import React, { useState, useEffect, useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { NorthStarLogo } from '../components/NorthStarLogo';
import styles from './NewHome.module.css';

gsap.registerPlugin(ScrollTrigger);

interface Client {
  _id: string;
  name: string;
  logoUrl?: string;
  website?: string;
  color: string;
  displayOrder: number;
}

// Helper function to convert hex color to hue rotation value for CSS filter
const getHueRotation = (hexColor: string): number => {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert hex to RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  
  // Convert RGB to HSL to get hue
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  
  if (max !== min) {
    const delta = max - min;
    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / delta + 2) / 6;
    } else {
      h = ((r - g) / delta + 4) / 6;
    }
  }
  
  return Math.round(h * 360);
};

const NewHome: React.FC = () => {
  const founderImage = '/headshot.JPG';
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    message: ''
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [scrollHintText, setScrollHintText] = useState('Scroll to explore');

  // Refs for animation
  const heroRef = useRef<HTMLElement>(null);
  const servicesRef = useRef<HTMLElement>(null);
  const navbarRef = useRef<HTMLElement>(null);
  const logoWrapperRef = useRef<HTMLDivElement>(null);
  const heroLogoRef = useRef<HTMLDivElement>(null);
  const heroTextRef = useRef<HTMLDivElement>(null);
  const illuminateRef = useRef<HTMLSpanElement>(null);
  const financialRef = useRef<HTMLParagraphElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const formContainerRef = useRef<HTMLDivElement>(null);
  const formInputRefs = useRef<(HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | null)[]>([]);
  // Individual form input refs for art piece animation
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const companyInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const aboutSectionRef = useRef<HTMLElement>(null);
  const aboutImageRef = useRef<HTMLDivElement>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const credentialCardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const serviceCardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const scrollHintRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  const hoverAnimationRef = useRef<number | null>(null);

  const drawCanvas = useCallback((): void => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = sourceImageRef.current;
    const container = aboutImageRef.current;

    if (!canvas || !ctx || !img || !container) return;

    const containerRect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = containerRect.width;
    const height = containerRect.height;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const scale = 1.05;
    const naturalWidth = img.naturalWidth || width;
    const naturalHeight = img.naturalHeight || height;
    const imageRatio = naturalWidth / naturalHeight;
    const containerRatio = width / height;

    let drawWidth: number;
    let drawHeight: number;

    if (containerRatio > imageRatio) {
      drawWidth = width * scale;
      drawHeight = drawWidth / imageRatio;
    } else {
      drawHeight = height * scale;
      drawWidth = drawHeight * imageRatio;
    }

    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;

    const edgeInset = dpr > 1 ? 0.999 : 0.6;
    const radiusInset = edgeInset;

    const parseRadius = (value: string | null): number => {
      if (!value) return 0;
      const parsed = parseFloat(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    let hasOverlap = false;

    credentialCardsRef.current.forEach((card) => {
      if (!card) return;

      const cardRect = card.getBoundingClientRect();
      const intersectionLeft = Math.max(cardRect.left, containerRect.left);
      const intersectionRight = Math.min(cardRect.right, containerRect.right);
      const intersectionTop = Math.max(cardRect.top, containerRect.top);
      const intersectionBottom = Math.min(cardRect.bottom, containerRect.bottom);

      if (intersectionRight <= intersectionLeft || intersectionBottom <= intersectionTop) return;

      const cardX = cardRect.left - containerRect.left + edgeInset;
      const cardY = cardRect.top - containerRect.top + edgeInset;
      const cardWidth = Math.max(0, cardRect.width - edgeInset * 2);
      const cardHeight = Math.max(0, cardRect.height - edgeInset * 2);

      const styles = getComputedStyle(card);
      const radii = {
        tl: Math.max(0, parseRadius(styles.borderTopLeftRadius) - radiusInset),
        tr: Math.max(0, parseRadius(styles.borderTopRightRadius) - radiusInset),
        br: Math.max(0, parseRadius(styles.borderBottomRightRadius) - radiusInset),
        bl: Math.max(0, parseRadius(styles.borderBottomLeftRadius) - radiusInset)
      };

      const cardPath = new Path2D();
      cardPath.moveTo(cardX + radii.tl, cardY);
      cardPath.lineTo(cardX + cardWidth - radii.tr, cardY);
      cardPath.quadraticCurveTo(cardX + cardWidth, cardY, cardX + cardWidth, cardY + radii.tr);
      cardPath.lineTo(cardX + cardWidth, cardY + cardHeight - radii.br);
      cardPath.quadraticCurveTo(cardX + cardWidth, cardY + cardHeight, cardX + cardWidth - radii.br, cardY + cardHeight);
      cardPath.lineTo(cardX + radii.bl, cardY + cardHeight);
      cardPath.quadraticCurveTo(cardX, cardY + cardHeight, cardX, cardY + cardHeight - radii.bl);
      cardPath.lineTo(cardX, cardY + radii.tl);
      cardPath.quadraticCurveTo(cardX, cardY, cardX + radii.tl, cardY);
      cardPath.closePath();

      const intersectionPath = new Path2D();
      intersectionPath.rect(
        intersectionLeft - containerRect.left,
        intersectionTop - containerRect.top,
        intersectionRight - intersectionLeft,
        intersectionBottom - intersectionTop
      );

      ctx.save();
      ctx.clip(cardPath);
      ctx.clip(intersectionPath);
      ctx.filter = 'blur(18px)';
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      ctx.restore();
      hasOverlap = true;
    });

    if (!hasOverlap) {
      ctx.clearRect(0, 0, width, height);
    }

    ctx.filter = 'none';
  }, []);

  const handleImageLoad = () => {
    drawCanvas();
  };

  useEffect(() => {
    if (!heroRef.current || !servicesRef.current || !heroTextRef.current || !heroLogoRef.current || !logoWrapperRef.current) return;

    // Pin the logo wrapper to match hero animation duration - use hero as trigger for perfect sync
    ScrollTrigger.create({
      trigger: heroRef.current,
      start: 'top top',
      end: '+=400%',
      pin: logoWrapperRef.current,
      pinSpacing: false
    });

    // Set initial states for all elements to prevent flash
    gsap.set(heroLogoRef.current, {
      opacity: 0
    });

    // Set text elements to visible with gradient at start position
    gsap.set([illuminateRef.current, financialRef.current, subtitleRef.current], {
      opacity: 1
    });

    // Set form container to start below viewport
    gsap.set(formContainerRef.current, {
      y: '120%'
    });

    // Set inputs with visible staggered offsets (16px increments for clear visual effect)
    gsap.set(nameInputRef.current, { y: 'calc(120% + 16px)' });
    gsap.set(emailInputRef.current, { y: 'calc(120% + 32px)' });
    gsap.set(phoneInputRef.current, { y: 'calc(120% + 48px)' });
    gsap.set(companyInputRef.current, { y: 'calc(120% + 64px)' });
    gsap.set(messageInputRef.current, { y: 'calc(120% + 80px)' });
    gsap.set(buttonRef.current, { y: 'calc(120% + 96px)' });

    // Set scroll hint to visible initially
    if (scrollHintRef.current) {
      gsap.set(scrollHintRef.current, { opacity: 1, y: 0 });
    }

    // Set 3D transform properties for form inputs (art piece on strings effect)
    gsap.set([nameInputRef.current, emailInputRef.current, phoneInputRef.current, 
              companyInputRef.current, messageInputRef.current, buttonRef.current], {
      transformPerspective: 1000,
      transformStyle: 'preserve-3d'
    });

    // Calculate the position to move the logo behind the text
    const heroRect = heroRef.current.getBoundingClientRect();
    const textRect = heroTextRef.current.getBoundingClientRect();
    const logoRect = heroLogoRef.current.getBoundingClientRect();
    
    // Calculate how much to move from center to behind text
    const targetX = (textRect.left + textRect.width / 2) - (heroRect.left + heroRect.width / 2);
    const targetY = (textRect.top + textRect.height / 2) - (heroRect.top + heroRect.height / 2);

    // Create scroll-controlled timeline for hero section
    // Pin during animation with extended scroll distance
    const heroTimeline = gsap.timeline({
      scrollTrigger: {
        trigger: heroRef.current,
        start: 'top top',
        end: '+=400%',            // 100vh for main animation
        scrub: 0,                 // 0 = instant 1:1 scroll mapping (no smoothing)
        pin: true,
        pinSpacing: true,
        anticipatePin: 0.5,
        fastScrollEnd: true,
        onUpdate: (self) => {
          if (!scrollHintRef.current) return;
          
          // Show "Scroll to explore" when at position 0
          if (self.progress === 0) {
            setScrollHintText('Scroll to explore');
            gsap.to(scrollHintRef.current, { opacity: 1, duration: 0.5, delay: 0.2 });
          }
          // Hide scroll hint when user scrolls away from top
          else if (self.progress > 0.01) {
            gsap.to(scrollHintRef.current, { opacity: 0, duration: 0.3 });
          }
        }
      }
    });

    // 1. Logo twist-in: scale up and roll 45º (0-7.5% of scroll timeline) - faster
    heroTimeline.fromTo(heroLogoRef.current, 
      {
        scale: 0,
        rotation: 45,
        opacity: 1,
        x: 0
      },
      {
        scale: 1,
        rotation: 0,
        opacity: 0.08, // Fade to background opacity during the bounce
        duration: 7.5, // Half the original duration for faster bounce
        ease: 'power2.out' // Changed from back.out to prevent opacity overshoot
      }
    )
    // Additional animation for scale with bounce (parallel to above, just for scale)
    .to(heroLogoRef.current, {
      scale: 1,
      duration: 0.01,
      ease: 'back.out(1.7)' // Apply bounce only to scale
    }, 7.5)
    // 1b. Hold in place (7.5-15%)
    .to({}, { duration: 7.49 }) // Hold in place with background opacity
    // 2. Roll another 90º and move left to center behind text (15-25%) - NO opacity change
    .to(heroLogoRef.current, {
      rotation: -90,
      x: targetX,
      y: targetY,
      scale: 1.4,
      duration: 10,
      ease: 'power2.inOut'
    }, '<') // Start at same time as previous to ensure no gap
    // 3. Reveal "Illuminate Every" left to right with gradient mask (25-40%)
    .fromTo(illuminateRef.current, 
      {
        backgroundPosition: '100% 0%'
      },
      {
        backgroundPosition: '0% 0%',
        duration: 15,
        ease: 'power2.inOut'
      }
    )
    // 4. Reveal "Financial Decision" top to bottom with gradient mask (35-50%)
    .fromTo(financialRef.current,
      {
        backgroundPosition: '0% 100%'
      },
      {
        backgroundPosition: '0% 0%',
        duration: 15,
        ease: 'power2.inOut'
      },
      '-=8' // Overlap with previous by 8 units
    )
    // 5. Reveal subtitle diagonally top-left to bottom-right (50-60%)
    .fromTo(subtitleRef.current, {
      backgroundPosition: '100% 100%'
    }, {
      backgroundPosition: '0% 0%',
      duration: 10
    }, '-=5')
    // 6. Form "pulled up by strings" - staggered start → aligned finish (with staggered timing)
    // Elements start with gaps, land at y:0 (no gaps) one after another
    .add('formStart', '-=5')
    .fromTo(formContainerRef.current, {
      y: '120%'
    }, {
      y: 0,
      duration: 8,
      ease: 'none'
    }, 'formStart')  // Form lands first at formStart + 8
    .fromTo(nameInputRef.current, { 
      y: 'calc(120% + 16px)'
    }, { 
      y: 0,  // Aligns with form (no gap)
      duration: 8,
      ease: 'none'
    }, 'formStart+=0.5')  // Lands 0.5 scroll units after form
    .fromTo(emailInputRef.current, { 
      y: 'calc(120% + 32px)'
    }, { 
      y: 0,
      duration: 8,
      ease: 'none'
    }, 'formStart+=1')  // Lands 1 scroll unit after form
    .fromTo(phoneInputRef.current, { 
      y: 'calc(120% + 48px)'
    }, { 
      y: 0,
      duration: 8,
      ease: 'none'
    }, 'formStart+=1.5')
    .fromTo(companyInputRef.current, { 
      y: 'calc(120% + 64px)'
    }, { 
      y: 0,
      duration: 8,
      ease: 'none'
    }, 'formStart+=2')
    .fromTo(messageInputRef.current, { 
      y: 'calc(120% + 80px)'
    }, { 
      y: 0,
      duration: 8,
      ease: 'none'
    }, 'formStart+=2.5')
    .fromTo(buttonRef.current, { 
      y: 'calc(120% + 96px)'
    }, { 
      y: 0,
      duration: 8,
      ease: 'none'
    }, 'formStart+=3')  // Last element lands 3 scroll units after form
    // Hold aligned (no gaps) until unpin
    .to({}, { duration: 30 });

    // Exit animation for form - only plays AFTER unpin when true scrolling occurs
    const exitTl = gsap.timeline({
      scrollTrigger: {
        trigger: heroRef.current,
        start: 'bottom bottom',
        end: '+=65%',
        scrub: true
      }
    });

    // Exit: Pull from staggered positions with staggered timing
    exitTl
      .to(formContainerRef.current, { 
        y: '-120%', 
        duration: 8, 
        ease: 'none' 
      }, 0)  // Exits first at position 0
      .to(nameInputRef.current, { 
        y: 'calc(-120% - 8px)', 
        duration: 8, 
        ease: 'none' 
      }, 0.5)  // Exits at position 0.5
      .to(emailInputRef.current, { 
        y: 'calc(-120% - 16px)', 
        duration: 8, 
        ease: 'none' 
      }, 1)
      .to(phoneInputRef.current, { 
        y: 'calc(-120% - 24px)', 
        duration: 8, 
        ease: 'none' 
      }, 1.5)
      .to(companyInputRef.current, { 
        y: 'calc(-120% - 32px)', 
        duration: 8, 
        ease: 'none' 
      }, 2)
      .to(messageInputRef.current, { 
        y: 'calc(-120% - 40px)', 
        duration: 8, 
        ease: 'none' 
      }, 2.5)
      .to(buttonRef.current, { 
        y: 'calc(-120% - 48px)', 
        duration: 8, 
        ease: 'none' 
      }, 3);

    // Scroll-triggered animations for service cards - instant scroll mapping, staggered appearance
    serviceCardsRef.current.forEach((card, index) => {
      if (card) {
        const staggerOffset = index * 3;  // 3% scroll offset between each card
        gsap.fromTo(card, {
          opacity: 0,
          y: 30
        }, {
          opacity: 1,
          y: 0,
          ease: 'none',  // Linear - no easing curves
          scrollTrigger: {
            trigger: card,
            start: `top ${92 - staggerOffset}%`,
            end: `top ${77 - staggerOffset}%`,
            scrub: true,  // true = instant 1:1 scroll mapping, no smoothing delay
            invalidateOnRefresh: true
          }
        });
      }
    });

    const updateOverlays = () => {
      drawCanvas();
    };

    window.addEventListener('scroll', updateOverlays, { passive: true });
    window.addEventListener('resize', updateOverlays);
    updateOverlays();

    // Parallax scrolling for about section image
    if (aboutSectionRef.current && aboutImageRef.current) {
      gsap.to(aboutImageRef.current, {
        y: 180,
        ease: 'none',
        scrollTrigger: {
          trigger: aboutSectionRef.current,
          start: 'top 140%',
          end: '+=260%',
          scrub: true
        }
      });
    }

    // Inactivity detection for secondary scroll hint
    let lastScrollTime = Date.now();
    let isInHeroSection = true;
    let lastScrollY = window.scrollY;
    
    const handleScrollActivity = () => {
      lastScrollTime = Date.now();
      const currentScrollY = window.scrollY;
      
      // Check if we're still in the hero section (first animation)
      const heroRect = heroRef.current?.getBoundingClientRect();
      isInHeroSection = heroRect ? heroRect.bottom > window.innerHeight * 0.5 : false;
      
      // Check form visibility - disable hint once form starts appearing
      const formVisible = formContainerRef.current?.getBoundingClientRect().top !== undefined &&
                         formContainerRef.current.getBoundingClientRect().top < window.innerHeight;
      
      // Show "Scroll to explore" when returning to top
      if (currentScrollY === 0 && lastScrollY > 0 && scrollHintRef.current) {
        setScrollHintText('Scroll to explore');
        gsap.to(scrollHintRef.current, { opacity: 1, duration: 0.5, delay: 0.2 });
      }
      
      lastScrollY = currentScrollY;
      
      // Clear existing timer
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      
      // Only set new timer if: in hero section, not at top, AND form is not visible yet
      if (isInHeroSection && window.scrollY > 50 && !formVisible) {
        inactivityTimerRef.current = window.setTimeout(() => {
          const timeSinceLastScroll = Date.now() - lastScrollTime;
          // If 10+ seconds have passed and still in hero section (and form still not visible)
          const stillNotVisible = formContainerRef.current?.getBoundingClientRect().top !== undefined &&
                                 formContainerRef.current.getBoundingClientRect().top >= window.innerHeight;
          if (timeSinceLastScroll >= 10000 && isInHeroSection && scrollHintRef.current && window.scrollY > 50 && stillNotVisible) {
            setScrollHintText('Scroll more to continue exploring');
            gsap.to(scrollHintRef.current, { 
              opacity: 1, 
              duration: 0.8,
              ease: 'power2.inOut'
            });
          }
        }, 10000);
      }
    };

    // Listen for scroll events to track activity
    window.addEventListener('scroll', handleScrollActivity);
    window.addEventListener('wheel', handleScrollActivity);
    window.addEventListener('touchmove', handleScrollActivity);
    
    // Initial timer setup
    handleScrollActivity();

    // Cleanup
    return () => {
      ScrollTrigger.getAll().forEach(trigger => trigger.kill());
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
      }
      window.removeEventListener('scroll', handleScrollActivity);
      window.removeEventListener('wheel', handleScrollActivity);
      window.removeEventListener('touchmove', handleScrollActivity);
      window.removeEventListener('scroll', updateOverlays);
      window.removeEventListener('resize', updateOverlays);
    };
  }, [drawCanvas]);

  useEffect(() => {
    const cards = credentialCardsRef.current.filter((card): card is HTMLDivElement => Boolean(card));
    if (!cards.length) return;

    const repaintDuringTransition = () => {
      if (hoverAnimationRef.current) {
        cancelAnimationFrame(hoverAnimationRef.current);
      }

      const durationMs = 400;
      const start = performance.now();

      const step = (now: number) => {
        drawCanvas();
        if (now - start < durationMs) {
          hoverAnimationRef.current = requestAnimationFrame(step);
        } else {
          hoverAnimationRef.current = null;
        }
      };

      hoverAnimationRef.current = requestAnimationFrame(step);
    };

    const handleTransitionEnd = () => {
      drawCanvas();
    };

    cards.forEach((card) => {
      card.addEventListener('mouseenter', repaintDuringTransition);
      card.addEventListener('mouseleave', repaintDuringTransition);
      card.addEventListener('transitionend', handleTransitionEnd);
    });

    return () => {
      if (hoverAnimationRef.current) {
        cancelAnimationFrame(hoverAnimationRef.current);
      }
      cards.forEach((card) => {
        card.removeEventListener('mouseenter', repaintDuringTransition);
        card.removeEventListener('mouseleave', repaintDuringTransition);
        card.removeEventListener('transitionend', handleTransitionEnd);
      });
    };
  }, [drawCanvas]);

  // Fetch clients from MongoDB
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await fetch('/api/clients');
        const data = await response.json();
        if (data.clients) {
          setClients(data.clients);
        }
      } catch (error) {
        console.error('Error fetching clients:', error);
      }
    };

    fetchClients();
  }, []);

  // Cursor-following effect for service cards
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, index: number) => {
    const card = serviceCardsRef.current[index];
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    card.style.setProperty('--mouse-x', `${x}%`);
    card.style.setProperty('--mouse-y', `${y}%`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    alert("Thank you! We'll contact you within 24 hours.");
    setFormData({ name: '', email: '', phone: '', company: '', message: '' });
  };

  return (
    <div className={styles.page}>
      {/* Logo watermark wrapper - pinned during hero animation to allow overflow onto navbar */}
      <div ref={logoWrapperRef} className={styles.heroLogoWrapper}>
        <div ref={heroLogoRef} className={styles.heroLogoWatermark}>
          <NorthStarLogo size={700} color="rgba(174, 191, 190, 0.06)" />
        </div>
      </div>

      {/* Hero Section */}
      <section ref={heroRef} className={styles.hero}>
        {/* Scroll hint - shows immediately and updates based on scroll position */}
        <div ref={scrollHintRef} className={styles.scrollHint}>
          <span className={styles.scrollHintText}>{scrollHintText}</span>
          <svg className={styles.scrollHintArrow} width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        
        <div className={styles.heroContent}>
          <div ref={heroTextRef} className={styles.heroText}>
            <h1 className={styles.heroTitle}>
              <span ref={illuminateRef} className={styles.heroTitleIlluminate}>
                Illuminate Every
              </span>{' '}
              <span ref={financialRef} className={styles.heroTitleAccent}>
                Financial Decision
              </span>
            </h1>
            <p ref={subtitleRef} className={styles.heroSubtitle}>
              Strategic financial guidance for growing businesses. Transform your numbers into clarity, control, and confident decisions.
            </p>
          </div>

          <div ref={formContainerRef} className={styles.heroFormContainer}>
            <h3 className={styles.heroFormTitle}>Book Free Consultation</h3>
            <form className={styles.heroForm} onSubmit={handleSubmit}>
              <input
                ref={nameInputRef}
                type="text"
                placeholder="Your Name"
                className={styles.heroFormInput}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <input
                ref={emailInputRef}
                type="email"
                placeholder="Email Address"
                className={styles.heroFormInput}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
              <input
                ref={phoneInputRef}
                type="tel"
                placeholder="Phone Number"
                className={styles.heroFormInput}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
              <input
                ref={companyInputRef}
                type="text"
                placeholder="Company Name"
                className={styles.heroFormInput}
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />
              <textarea
                ref={messageInputRef}
                placeholder="What can we help you with?"
                className={styles.heroFormTextarea}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              />
              <button ref={buttonRef} type="submit" className={styles.heroFormButton}>
                Get Started
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Sticky Navbar - positioned to stick when services section scrolls into view */}
      <nav ref={navbarRef} className={styles.navbar}>
        <div className={styles.navContainer}>
          <div className={styles.navBrand}>
            <NorthStarLogo size={38} color="#5a6f5a" />
            <span className={styles.navBrandText}>
              Lumina Strategy Group
            </span>
          </div>

          <div className={styles.navLinks}>
            {['Services', 'About', 'Contact'].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className={styles.navLink}
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* Services Section */}
      <section ref={servicesRef} id="services" className={styles.services}>
        <div className={styles.servicesContainer}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionLabel}>What We Do</div>
            <h2 className={styles.sectionTitle}>Comprehensive Financial Services</h2>
            <p className={styles.sectionDescription}>
              Specializing in internal controls, systems implementation, and financial analytics for manufacturing and retail businesses
            </p>
          </div>

          <div className={styles.servicesGrid}>
            {[
              {
                title: 'Internal Controls & Compliance',
                description: 'Robust internal control frameworks to protect your assets and ensure regulatory compliance.',
                features: ['Control Design', 'Risk Assessment', 'Compliance Audits']
              },
              {
                title: 'Systems Implementation',
                description: 'QuickBooks, Power BI, and automation solutions that streamline operations and eliminate manual work.',
                features: ['QuickBooks Setup', 'Power BI Dashboards', 'Process Automation']
              },
              {
                title: 'Financial Analytics',
                description: 'Data-driven insights that illuminate trends, optimize margins, and drive strategic decisions.',
                features: ['KPI Tracking', 'Margin Analysis', 'Predictive Analytics']
              },
              {
                title: 'Bookkeeping & Reconciliation',
                description: 'Accurate monthly bookkeeping, reconciliations, and financial statements you can trust.',
                features: ['Monthly Close', 'Account Reconciliation', 'Financial Reporting']
              },
              {
                title: 'Strategic Advisory',
                description: 'CFO-level guidance on pricing, forecasting, and growth strategy for scaling businesses.',
                features: ['Financial Strategy', 'Growth Planning', 'Pricing Architecture']
              },
              {
                title: 'AR/AP Management',
                description: 'Complete accounts receivable and payable management with dedicated support.',
                features: ['Invoice Management', 'Payment Processing', 'Vendor Relations']
              }
            ].map((service, i) => (
              <div 
                key={i} 
                ref={(el) => serviceCardsRef.current[i] = el}
                className={styles.serviceCard}
                onMouseMove={(e) => handleMouseMove(e, i)}
              >
                <h3 className={styles.serviceTitle}>{service.title}</h3>
                <p className={styles.serviceDescription}>{service.description}</p>
                <ul className={styles.serviceFeatures}>
                  {service.features.map((feature, fi) => (
                    <li key={fi} className={styles.serviceFeature}>{feature}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className={styles.about} ref={aboutSectionRef}>
        {/* Parallax Image with canvas blur mask */}
        <div className={styles.parallaxImageContainer} ref={aboutImageRef}>
          <img
            ref={sourceImageRef}
            src={founderImage}
            alt="Natasha Mayr collaborating with a client"
            className={styles.parallaxImage}
            loading="lazy"
            onLoad={handleImageLoad}
          />
          <div className={styles.canvasMask}>
            <div className={styles.canvasClip}>
              <canvas
                ref={canvasRef}
                width={560}
                height={560}
                className={styles.parallaxCanvas}
              />
            </div>
          </div>
        </div>

        <div className={styles.aboutContainer}>
          {/* Text Content Block */}
          <div className={styles.aboutContent}>
            <div className={styles.sectionLabel}>Meet the Founder</div>
            <h2 className={styles.sectionTitle}>Natasha Mayr</h2>

            <p className={styles.aboutText}>
              Lumina Strategy Group exists because growing businesses are overwhelmed by disorganized financial systems, unclear numbers, and a lack of strategic guidance—preventing them from making confident, data-driven decisions.
            </p>

            <p className={styles.aboutTextSecondary}>
              With deep experience in manufacturing and retail, plus a background at Deloitte, Natasha brings technical expertise and strategic insight to help businesses scale with confidence.
            </p>
          </div>

          {/* Credential Cards - Single Horizontal Row */}
          <div className={styles.credentialsGrid}>
            {[
              { label: 'Education', value: 'B.S.\nAccounting', subtitle: 'University of Utah' },
              { label: 'Experience', value: 'Audit &\nAssurance', subtitle: 'Deloitte LLP' },
              { label: 'Expertise', value: 'QuickBooks\nPower BI', subtitle: 'Financial Analytics' },
              { label: 'Certifications', value: 'CPA Track\nData Analytics', subtitle: 'Professional Development' }
            ].map((item, i) => (
              <div
                key={i}
                className={`${styles.credentialItem} credential-card-${i}`}
                ref={(el) => (credentialCardsRef.current[i] = el)}
              >
                <div className={styles.credentialLabel}>{item.label}</div>
                <div className={styles.credentialValue}>{item.value}</div>
                <div className={styles.credentialSubtitle}>{item.subtitle}</div>
              </div>
            ))}
          </div>

          {/* Quote at Bottom */}
          <div className={styles.quote}>
            <p className={styles.quoteText}>
              "I believe that when business owners truly understand their numbers, they unlock their potential—and that's what Lumina is all about."
            </p>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className={styles.contact}>
        <div className={styles.contactContainer}>
          <div className={styles.contactCta}>
            <div className={styles.sectionLabel}>Get In Touch</div>
            <h2 className={styles.contactTitle}>Ready to Illuminate Your Financial Future?</h2>
            <p className={styles.contactSubtitle}>
              Join the growing list of companies that trust Lumina Strategy Group for accounting services, business improvement, and financial assistance.
            </p>
            <button 
              onClick={() => document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' })}
              className={styles.contactCtaButton}
            >
              Schedule Free Consultation
            </button>
          </div>

          {clients.length > 0 && (
            <div>
              <div className={styles.clientsLabel}>Trusted By</div>
              <div className={styles.clientsGrid}>
                {clients.map((client) => (
                  <div
                    key={client._id}
                    className={styles.clientCard}
                    onClick={() => client.website && window.open(client.website, '_blank', 'noopener,noreferrer')}
                    title={client.name}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && client.website) {
                        e.preventDefault();
                        window.open(client.website, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    style={{
                      cursor: client.website ? 'pointer' : 'default'
                    }}
                  >
                    {client.logoUrl ? (
                      <img
                        src={`/api/clients/${client._id}/logo`}
                        alt={client.name}
                        className={styles.clientLogo}
                        style={{
                          filter: `grayscale(100%) brightness(0) invert(1) sepia(1) saturate(5) hue-rotate(${getHueRotation(client.color)}deg)`
                        }}
                      />
                    ) : (
                      <span className={styles.clientName}>{client.name}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContainer}>
          <div className={styles.footerGrid}>
            <div className={styles.footerColumn}>
              <div className={styles.footerBrand}>
                <NorthStarLogo size={48} color="#798C8C" />
              </div>
              <div className={styles.footerBrandText}>
                Lumina Strategy Group
              </div>
              <p className={styles.footerDescription}>
                Strategic financial guidance for growing businesses. Illuminate every decision.
              </p>
            </div>

            <div className={styles.footerColumn}>
              <h4 className={styles.footerTitle}>Quick Links</h4>
              <div className={styles.footerLinks}>
                {['Services', 'About', 'Contact'].map((link) => (
                  <a
                    key={link}
                    href={`#${link.toLowerCase()}`}
                    className={styles.footerLink}
                  >
                    {link}
                  </a>
                ))}
              </div>
            </div>

            <div className={styles.footerColumn}>
              <h4 className={styles.footerTitle}>Contact</h4>
              <div className={styles.footerContact}>
                mayrconsultingservices@gmail.com
              </div>
              <div className={styles.footerContactSecondary}>
                Serving manufacturing & retail businesses
              </div>
            </div>
          </div>

          <div className={styles.footerBottom}>
            <p className={styles.copyright}>
              © 2025 Lumina Strategy Group. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default NewHome;
