import { useState, useEffect, useCallback } from "react";

// Hook for detecting mobile screen size
export function useMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    // Initial check
    checkMobile();

    // Listen for window resize events
    window.addEventListener("resize", checkMobile);

    // Cleanup event listener on component unmount
    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  return isMobile;
}

// Hook for persisting data in localStorage
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error("Error reading from localStorage:", error);
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T) => {
      try {
        setStoredValue(value);
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.error("Error writing to localStorage:", error);
      }
    },
    [key]
  );

  return [storedValue, setValue];
}

// Hook for handling form submission state
export function useFormSubmit<T>(
  onSubmit: (data: T) => Promise<void>
): [boolean, (data: T) => Promise<void>] {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: T) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  return [isSubmitting, handleSubmit];
}

// Hook for clipboard operations
export function useClipboard(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      
      // Reset after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      setCopied(false);
    }
  };

  return [copied, copyToClipboard];
}
