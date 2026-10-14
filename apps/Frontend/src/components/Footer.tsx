export function Footer() {
  return (
    <footer className="border-t border-line bg-surface-2">
      <div className="max-w-[1400px] mx-auto px-5 py-10 flex flex-col md:flex-row md:items-start justify-between gap-8">
        <div>
          <div className="text-base font-semibold text-ink">retromobi</div>
          <p className="mt-1 text-sm text-ink-3 max-w-xs">
            Licensed scooter and motorcycle rentals across Dehradun, Haridwar and Rishikesh.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-12 gap-y-6 text-sm">
          <div>
            <div className="text-ink-3 font-medium mb-2">Legal</div>
            <ul className="space-y-1.5 text-ink-2">
              <li>Grievance officer</li>
              <li>National Consumer Helpline</li>
              <li>Privacy notice</li>
              <li>User agreement</li>
              <li>Cancellation policy</li>
              <li>Ranking parameters</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="max-w-[1400px] mx-auto px-5 py-4 text-xs text-ink-4">
          © {new Date().getFullYear()} RetroMobi. An e-commerce marketplace — not the vehicle supplier.
        </div>
      </div>
    </footer>
  );
}
