/// <reference types="astro/client" />

// Alpine.js Window interface for IDE autocompletion
// https://docs.astro.build/en/guides/integrations-guide/alpinejs/#intellisense-for-typescript
interface Window {
	Alpine: import('alpinejs').Alpine;
}
