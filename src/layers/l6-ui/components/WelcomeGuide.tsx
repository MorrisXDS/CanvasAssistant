/**
 * WelcomeGuide Component
 * Multi-step walkthrough overlay that appears once after onboarding completes.
 * Explains each page of the app to new users.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  LayoutDashboard,
  GraduationCap,
  CheckSquare,
  Calendar,
  FolderOpen,
  Megaphone,
  Bell,
  Lightbulb,
  ChevronRight,
  ChevronLeft,
  type LucideIcon,
} from 'lucide-react';
import { Button } from './primitives/Button';
import {
  welcomeGuideStyles as styles,
  welcomeGuideAnimations,
} from './welcomeGuideStyles';

// =============================================================================
// TYPES
// =============================================================================

export interface WelcomeGuideProps {
  onComplete: () => void;
}

interface GuideStep {
  icon: LucideIcon;
  title: string;
  description: string;
}

// =============================================================================
// STEP DEFINITIONS
// =============================================================================

const STEPS: GuideStep[] = [
  {
    icon: LayoutDashboard,
    title: 'Dashboard',
    description:
      'Your home screen \u2014 see active courses, pending and overdue tasks, and your average grade at a glance. The priority queue ranks your most urgent work. Right-click tasks for quick actions.',
  },
  {
    icon: GraduationCap,
    title: 'Courses',
    description:
      'All your courses with grades and progress. Switch between grid and list view, search, or pin favorites. Click a course for its detail page: tasks by type, grade history, announcements, and syllabus.',
  },
  {
    icon: CheckSquare,
    title: 'Tasks',
    description:
      'Every assignment across all courses in one list. Filter by pending, overdue, or completed. Sorted by deadline with overdue items first. Right-click for quick actions.',
  },
  {
    icon: Calendar,
    title: 'Calendar',
    description:
      'Month and week views, color-coded by course. Click any date to see what\u2019s due. Import or export ICS files to sync with external calendars.',
  },
  {
    icon: FolderOpen,
    title: 'Files',
    description:
      'Mirrors your Canvas folder structure. Browse, search, and download files. Notification dots appear on folders with new content.',
  },
  {
    icon: Megaphone,
    title: 'Announcements',
    description:
      'A searchable feed from all your courses. Filter by type, read status, or course. Dismiss items to clear them from your unread list.',
  },
  {
    icon: Bell,
    title: 'Updates',
    description:
      'See what changed since your last sync. Items on the left need your action (conflicts, queued tasks). The right side shows informational changes like grades, files, and announcements.',
  },
  {
    icon: Lightbulb,
    title: 'Tips',
    description:
      'Drag to reorder sidebar items. Notification dots appear when new content arrives. Auto-sync runs on a schedule you control in Settings. Everything works offline.',
  },
];

// =============================================================================
// COMPONENT
// =============================================================================

export function WelcomeGuide({ onComplete }: WelcomeGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [isAnimating, setIsAnimating] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const isLastStep = currentStep === STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  // Navigate to a step with animation
  const goToStep = useCallback(
    (newStep: number) => {
      if (isAnimating || newStep < 0 || newStep >= STEPS.length) return;

      setDirection(newStep > currentStep ? 'forward' : 'backward');
      setIsAnimating(true);

      setTimeout(() => {
        setCurrentStep(newStep);
        setTimeout(() => setIsAnimating(false), 50);
      }, 200);
    },
    [currentStep, isAnimating]
  );

  const handleNext = useCallback(() => {
    if (isLastStep) {
      // Complete the guide
      setIsExiting(true);
      setTimeout(() => onComplete(), 300);
    } else {
      goToStep(currentStep + 1);
    }
  }, [currentStep, isLastStep, goToStep, onComplete]);

  const handleBack = useCallback(() => {
    if (!isFirstStep) {
      goToStep(currentStep - 1);
    }
  }, [currentStep, isFirstStep, goToStep]);

  const handleSkip = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onComplete(), 300);
  }, [onComplete]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleBack();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handleBack, handleSkip]);

  const step = STEPS[currentStep];
  const Icon = step.icon;

  return (
    <div
      style={{
        ...styles.container,
        ...(isExiting ? styles.containerExiting : {}),
      }}
    >
      <div style={styles.contentWrapper}>
        <div style={styles.contentInner}>
          {/* Progress dots */}
          <div style={styles.progressBar}>
            <div style={styles.progressDots}>
              {STEPS.map((_, idx) => {
                const isActive = idx === currentStep;
                const isCompleted = idx < currentStep;
                return (
                  <div
                    key={idx}
                    style={{
                      ...styles.progressDot,
                      ...(isCompleted ? styles.progressDotCompleted : {}),
                      ...(isActive ? styles.progressDotActive : {}),
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Step content */}
          <div
            style={{
              ...styles.content,
              ...(isAnimating && direction === 'forward' ? styles.contentExitLeft : {}),
              ...(isAnimating && direction === 'backward' ? styles.contentExitRight : {}),
            }}
          >
            <div style={styles.stepContent}>
              <div style={styles.stepBody}>
                <div style={styles.stepIcon}>
                  <Icon size={28} />
                </div>
                <h2 style={styles.stepTitle}>{step.title}</h2>
                <p style={styles.stepDescription}>{step.description}</p>
              </div>

              {/* Footer */}
              <div style={styles.footer}>
                {/* Left - Back button */}
                <div style={styles.footerLeft}>
                  {!isFirstStep && (
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={handleBack}
                      leftIcon={<ChevronLeft size={16} />}
                    >
                      Back
                    </Button>
                  )}
                </div>

                {/* Center - Skip or step counter */}
                <div style={styles.footerCenter}>
                  {!isLastStep ? (
                    <Button variant="ghost" size="sm" onClick={handleSkip}>
                      Skip
                    </Button>
                  ) : (
                    <span style={styles.stepCounter}>
                      {currentStep + 1} / {STEPS.length}
                    </span>
                  )}
                </div>

                {/* Right - Next/Finish button */}
                <div style={styles.footerRight}>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleNext}
                    rightIcon={!isLastStep ? <ChevronRight size={16} /> : undefined}
                    style={{ minWidth: '140px' }}
                  >
                    {isLastStep ? 'Get Started' : 'Next'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{welcomeGuideAnimations}</style>
    </div>
  );
}

export default WelcomeGuide;
