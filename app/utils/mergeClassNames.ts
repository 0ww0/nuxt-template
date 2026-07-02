import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function mergeClassNames(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export { mergeClassNames as cn };