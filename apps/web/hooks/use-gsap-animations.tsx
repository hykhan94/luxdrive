'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Register ScrollTrigger plugin
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger)
}

// Hero text split reveal animation
export function useHeroTextReveal(selector: string) {
  useEffect(() => {
    const element = document.querySelector(selector)
    if (!element) return

    const text = element.textContent || ''
    element.innerHTML = text
      .split('')
      .map((char, i) => 
        `<span class="inline-block opacity-0 translate-y-8" style="animation-delay: ${i * 0.03}s">${char === ' ' ? '&nbsp;' : char}</span>`
      )
      .join('')

    const chars = element.querySelectorAll('span')
    
    gsap.to(chars, {
      opacity: 1,
      y: 0,
      duration: 0.6,
      stagger: 0.03,
      ease: 'power3.out',
      delay: 0.5
    })

    return () => {
      element.textContent = text
    }
  }, [selector])
}

// Scroll-triggered section fade
export function useScrollFade(selector: string) {
  useEffect(() => {
    const elements = document.querySelectorAll(selector)
    
    elements.forEach((element) => {
      gsap.fromTo(element,
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: element,
            start: 'top 85%',
            end: 'bottom 15%',
            toggleActions: 'play none none reverse'
          }
        }
      )
    })

    return () => {
      ScrollTrigger.getAll().forEach(trigger => trigger.kill())
    }
  }, [selector])
}

// Vehicle cards stagger entrance
export function useStaggerEntrance(containerSelector: string, itemSelector: string) {
  useEffect(() => {
    const container = document.querySelector(containerSelector)
    if (!container) return

    const items = container.querySelectorAll(itemSelector)
    
    gsap.fromTo(items,
      { opacity: 0, y: 60 },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.15,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: container,
          start: 'top 80%',
          toggleActions: 'play none none reverse'
        }
      }
    )

    return () => {
      ScrollTrigger.getAll().forEach(trigger => trigger.kill())
    }
  }, [containerSelector, itemSelector])
}

// Numbers count-up animation
export function useCountUp(selector: string, endValue: number, duration: number = 2) {
  const hasAnimated = useRef(false)

  useEffect(() => {
    const element = document.querySelector(selector)
    if (!element || hasAnimated.current) return

    const countObj = { value: 0 }
    
    ScrollTrigger.create({
      trigger: element,
      start: 'top 85%',
      onEnter: () => {
        if (hasAnimated.current) return
        hasAnimated.current = true
        
        gsap.to(countObj, {
          value: endValue,
          duration: duration,
          ease: 'power2.out',
          onUpdate: () => {
            element.textContent = Math.round(countObj.value).toLocaleString()
          }
        })
      }
    })

    return () => {
      ScrollTrigger.getAll().forEach(trigger => trigger.kill())
    }
  }, [selector, endValue, duration])
}

// Booking progress bar animation
export function useProgressBar(selector: string, targetWidth: number) {
  useEffect(() => {
    const element = document.querySelector(selector)
    if (!element) return

    gsap.fromTo(element,
      { width: '0%' },
      {
        width: `${targetWidth}%`,
        duration: 1.5,
        ease: 'power2.inOut',
        scrollTrigger: {
          trigger: element,
          start: 'top 90%',
          toggleActions: 'play none none reverse'
        }
      }
    )

    return () => {
      ScrollTrigger.getAll().forEach(trigger => trigger.kill())
    }
  }, [selector, targetWidth])
}

// Button hover effects hook
export function useButtonHover(selector: string) {
  useEffect(() => {
    const buttons = document.querySelectorAll(selector)
    
    buttons.forEach((button) => {
      const enterHandler = () => {
        gsap.to(button, {
          scale: 1.02,
          duration: 0.2,
          ease: 'power2.out'
        })
        gsap.to(button, {
          boxShadow: '0 0 20px rgba(201, 169, 97, 0.4)',
          duration: 0.3
        })
      }
      
      const leaveHandler = () => {
        gsap.to(button, {
          scale: 1,
          duration: 0.2,
          ease: 'power2.out'
        })
        gsap.to(button, {
          boxShadow: '0 0 0px rgba(201, 169, 97, 0)',
          duration: 0.3
        })
      }

      button.addEventListener('mouseenter', enterHandler)
      button.addEventListener('mouseleave', leaveHandler)
    })
  }, [selector])
}

// Page transition animation component
export function PageTransition({ children, isVisible }: { children: React.ReactNode, isVisible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    if (isVisible) {
      gsap.fromTo(containerRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
      )
    } else {
      gsap.to(containerRef.current, {
        opacity: 0,
        y: -20,
        duration: 0.3,
        ease: 'power2.in'
      })
    }
  }, [isVisible])

  return <div ref={containerRef}>{children}</div>
}
