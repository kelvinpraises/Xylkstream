"use client"

import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/utils"

const toggleGroupVariants = cva(
  "inline-flex items-center justify-center gap-px rounded-md",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        outline: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const toggleGroupItemVariants = cva(
  "ring-offset-background focus-visible:ring-ring data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-medium transition-all focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "first:rounded-l-md last:rounded-r-md hover:bg-muted/50 hover:text-muted-foreground/75",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground first:rounded-l-md last:rounded-r-md",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
    VariantProps<typeof toggleGroupVariants>
>(({ className, variant, children, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn(toggleGroupVariants({ variant, className }))}
    {...props}
  >
    <ToggleGroupContext.Provider value={{ variant }}>
      {children}
    </ToggleGroupContext.Provider>
  </ToggleGroupPrimitive.Root>
))

ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
    VariantProps<typeof toggleGroupItemVariants>
>(({ className, children, variant, ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext)

  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        toggleGroupItemVariants({
          variant: context.variant || variant,
          className,
        })
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
})

ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName

const ToggleGroupContext = React.createContext<{
  variant?: VariantProps<typeof toggleGroupItemVariants>["variant"]
}>({
  variant: "default",
})

export { ToggleGroup, ToggleGroupItem }
