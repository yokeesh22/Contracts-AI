/**
 * STERIS brand mark. The asset is shared with the IDP frontend
 * (public/assets/images/sterislogo.png) so both apps render the same logo.
 */
export default function SterisLogo({ className = '', height = 42 }) {
  return (
    <img
      src="/assets/images/sterislogo.png"
      alt="STERIS"
      className={className}
      style={{ height, width: 'auto', objectFit: 'contain' }}
    />
  )
}
