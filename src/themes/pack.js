// The pack's optional brand theme, in @layer theme.brand. It sits in its own module, imported after
// system.css, because Vite hoists an eager glob's imports above every other import in the same file,
// which put the theme ahead of the layer order in style.css.
import.meta.glob('@pack/theme/*.css', { eager: true });
