"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabDefinition = {
  value: string;
  label: ReactNode;
  content: ReactNode;
};

type TabsProps = {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  tabs: TabDefinition[];
  className?: string;
};

export function Tabs({ defaultValue, value, onValueChange, tabs, className }: TabsProps) {
  const initial = defaultValue ?? tabs[0]?.value;
  return (
    <TabsPrimitive.Root
      defaultValue={initial}
      value={value}
      onValueChange={onValueChange}
      className={cn("flex flex-col gap-4", className)}
    >
      <TabsPrimitive.List
        className="sticky top-14 z-30 -mx-3 flex snap-x snap-mandatory gap-1 overflow-x-auto border-b border-line bg-bg/90 px-3 backdrop-blur md:top-16 md:rounded-lg md:border md:border-line md:bg-panel md:px-1"
        aria-label="Sections"
      >
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            className="group relative shrink-0 snap-start whitespace-nowrap px-3 py-3 text-sm font-semibold text-muted transition data-[state=active]:text-accent-strong md:rounded-md md:py-2 md:data-[state=active]:bg-bg"
          >
            <span>{tab.label}</span>
            <span
              aria-hidden
              className="absolute inset-x-2 bottom-0 hidden h-0.5 rounded-full bg-accent-strong group-data-[state=active]:block md:group-data-[state=active]:hidden"
            />
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {tabs.map((tab) => (
        <TabsPrimitive.Content
          key={tab.value}
          value={tab.value}
          className="flex flex-col gap-4 outline-none"
        >
          {tab.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
