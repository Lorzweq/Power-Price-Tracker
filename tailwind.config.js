/** @type {import('tailwindcss').Config} */
// Tailwind lukee nämä tiedostot ja generoi CSS:n vain niissä käytetyille luokille.
// Luokkanimet pitää kirjoittaa kokonaisina merkkijonoina ('bg-green-50'),
// ei koota palasista (`bg-${vari}-50`), muuten Tailwind ei löydä niitä.
module.exports = {
  content: ["./docs/**/*.{html,js}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
