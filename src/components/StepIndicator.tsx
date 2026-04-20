import { useState } from "react";
import { Check } from "lucide-react";

interface StepIndicatorProps {
  currentStep: number;
  steps: string[];
  onStepClick?: (step: number) => void;
}

const StepIndicator = ({ currentStep, steps, onStepClick }: StepIndicatorProps) => {
  return (
    <div className="flex items-center justify-center w-full mb-8">
      {steps.map((label, index) => {
        const stepNum = index + 1;
        const isCompleted = currentStep > stepNum;
        const isCurrent = currentStep === stepNum;
        const clickable = !!onStepClick;

        return (
          <div key={label} className="flex items-center">
            <button
              type="button"
              onClick={() => clickable && onStepClick(stepNum)}
              disabled={!clickable}
              className={`flex flex-col items-center ${clickable ? "cursor-pointer group" : ""}`}
              aria-label={`Go to step ${stepNum}: ${label}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                  isCompleted
                    ? "gradient-flame text-accent-foreground"
                    : isCurrent
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "bg-muted text-muted-foreground"
                } ${clickable ? "group-hover:ring-2 group-hover:ring-primary/40" : ""}`}
              >
                {isCompleted ? <Check className="w-5 h-5" /> : stepNum}
              </div>
              <span
                className={`mt-2 text-xs font-medium hidden sm:block ${
                  isCurrent ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </button>
            {index < steps.length - 1 && (
              <div
                className={`w-12 sm:w-24 h-0.5 mx-2 transition-all duration-300 ${
                  isCompleted ? "gradient-flame" : "bg-muted"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StepIndicator;
