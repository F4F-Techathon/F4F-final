import type { InjectionKey } from 'vue'
import type { SpecimenEngine } from '../assets/specimens.ts'

/** The specimen engine of the page on show; every page gets a fresh one (and the old one's frames are freed). */
export const SPECIMENS: InjectionKey<() => SpecimenEngine> = Symbol('specimens')
