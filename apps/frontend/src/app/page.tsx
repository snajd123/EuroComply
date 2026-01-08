'use client';

import Link from 'next/link';
import Image from 'next/image';

// Icon component for Material Symbols
function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className}`}>{name}</span>
  );
}

// ===========================================
// NAVIGATION
// ===========================================
function Navigation() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-stone-200/50 dark:border-stone-800/50 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-xl">
      <div className="px-4 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col justify-center select-none cursor-pointer">
              <h2 className="text-2xl font-bold leading-none tracking-tighter font-sans text-[#00332A] dark:text-white">
                EuroComply<span className="text-[#2DD4BF]">.</span>
              </h2>
            </div>
          </div>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-10">
            <a href="#platform" className="text-text-muted dark:text-stone-400 hover:text-primary dark:hover:text-accent text-sm font-medium transition-colors">
              Platform
            </a>
            <a href="#compliance" className="text-text-muted dark:text-stone-400 hover:text-primary dark:hover:text-accent text-sm font-medium transition-colors">
              Compliance
            </a>
            <a href="#pricing" className="text-text-muted dark:text-stone-400 hover:text-primary dark:hover:text-accent text-sm font-medium transition-colors">
              Pricing
            </a>
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="hidden sm:block text-text-main dark:text-white hover:text-primary dark:hover:text-accent text-sm font-semibold transition-colors">
              Supplier Portal
            </Link>
            <button className="flex items-center justify-center rounded-lg h-10 px-6 btn-gradient text-white text-sm font-medium transition-all shadow-lg hover:shadow-primary/20">
              <span>Get Compliant</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

// ===========================================
// HERO SECTION
// ===========================================
function HeroSection() {
  return (
    <section className="relative pt-20 pb-24 lg:pt-32 lg:pb-40 overflow-hidden bg-background-light dark:bg-background-dark">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-radial from-accent/10 to-transparent opacity-60 blur-3xl rounded-full pointer-events-none -translate-y-1/2 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-radial from-primary/5 to-transparent opacity-60 blur-3xl rounded-full pointer-events-none translate-y-1/3 -translate-x-1/3" />
      <div className="absolute inset-0 bg-grid-pattern opacity-60 pointer-events-none h-full" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-[1400px] relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
          {/* Left content */}
          <div className="flex flex-col gap-8 lg:w-1/2">
            {/* Badge */}
            <div className="inline-flex items-center gap-3 pl-1 pr-4 py-1 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 w-fit shadow-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-primary dark:text-accent">
                <Icon name="bolt" className="text-[14px]" />
              </span>
              <span className="text-stone-600 dark:text-stone-300 text-xs font-bold uppercase tracking-wider font-display">
                ESPR 2026 Ready
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-text-main dark:text-white text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight font-display">
              The Standard for <br />
              <span className="relative whitespace-nowrap text-transparent bg-clip-text bg-gradient-to-r from-primary via-teal-700 to-accent dark:from-white dark:via-stone-200 dark:to-stone-400">
                SME Passports
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-text-muted dark:text-stone-400 text-lg sm:text-xl font-normal leading-relaxed max-w-lg border-l-2 border-accent pl-6">
              Secure your EU market access with the only Digital Product Passport platform engineered for supplier budgets. Compliant by design.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 mt-4">
              <button className="flex items-center justify-center rounded-lg h-14 px-8 btn-gradient text-white text-base font-medium transition-all shadow-xl shadow-primary/20 hover:shadow-primary/30 group">
                Verify Your Compliance
                <Icon name="arrow_forward" className="ml-2 group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="flex items-center justify-center rounded-lg h-14 px-8 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-text-main dark:text-white text-base font-medium hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors shadow-sm">
                <Icon name="description" className="mr-2 text-xl text-stone-400" />
                Regulatory Brief
              </button>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-10 mt-8 pt-8 border-t border-stone-200 dark:border-stone-800/50">
              <div>
                <p className="text-4xl font-bold text-text-main dark:text-white font-display">100%</p>
                <p className="text-xs text-text-muted uppercase tracking-wider mt-1">Regulation Coverage</p>
              </div>
              <div className="w-px h-12 bg-stone-200 dark:bg-stone-800" />
              <div>
                <p className="text-4xl font-bold text-text-main dark:text-white font-display">€0</p>
                <p className="text-xs text-text-muted uppercase tracking-wider mt-1">To Start for SMEs</p>
              </div>
            </div>
          </div>

          {/* Right - Dashboard preview */}
          <div className="lg:w-1/2 w-full relative">
            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl border border-stone-200/50 dark:border-stone-700/50 bg-stone-100 dark:bg-stone-900 hover:rotate-0 transition-transform duration-700 ease-out">
              {/* Browser chrome */}
              <div className="h-12 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 flex items-center px-4 justify-between">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-stone-200 dark:bg-stone-700" />
                  <div className="w-3 h-3 rounded-full bg-stone-200 dark:bg-stone-700" />
                </div>
                <div className="h-6 w-1/2 bg-stone-50 dark:bg-stone-800 rounded text-[10px] flex items-center justify-center text-stone-400 font-mono">
                  <Icon name="lock" className="text-[12px] mr-1" /> eurocomply.io
                </div>
                <div className="w-4" />
              </div>

              {/* Dashboard content */}
              <div className="w-full h-[calc(100%-48px)] relative bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-800 dark:to-stone-900">
                {/* Status card */}
                <div className="absolute top-8 left-8">
                  <div className="glass-panel p-4 rounded-xl shadow-lg border border-white/60 w-48 animate-float">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-stone-500 uppercase">Status</span>
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    </div>
                    <div className="text-2xl font-bold text-primary dark:text-white font-display">Verified</div>
                    <div className="text-xs text-stone-500 mt-1">Last check: 2m ago</div>
                  </div>
                </div>

                {/* Passport card */}
                <div className="absolute bottom-8 right-8">
                  <div className="bg-white dark:bg-stone-900 p-5 rounded-xl shadow-xl border border-stone-100 dark:border-stone-700 w-64">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-accent/10 p-2 rounded-lg text-primary dark:text-accent">
                        <Icon name="qr_code_2" />
                      </div>
                      <div>
                        <p className="text-xs text-stone-500 font-bold uppercase">Passport Generated</p>
                        <p className="text-sm font-bold text-stone-900 dark:text-white">ID: EU-8829-X</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-medium text-stone-500">
                        <span>Completeness</span>
                        <span className="text-primary dark:text-accent">100%</span>
                      </div>
                      <div className="h-1.5 w-full bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-accent w-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -z-10 -bottom-10 -right-10 w-full h-full border border-stone-200 dark:border-stone-800 rounded-2xl bg-stone-50 dark:bg-stone-900/50" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ===========================================
// COMPLIANCE GAP SECTION
// ===========================================
function ComplianceGapSection() {
  return (
    <section id="compliance" className="py-20 bg-white dark:bg-stone-900 border-y border-stone-200 dark:border-stone-800">
      <div className="container mx-auto px-4 max-w-[1400px]">
        <div className="flex flex-col md:flex-row gap-16 items-start">
          {/* Left sidebar */}
          <div className="md:w-1/3 sticky top-24">
            <span className="text-accent font-bold tracking-widest uppercase text-xs mb-2 block">The Challenge</span>
            <h3 className="text-3xl font-bold text-text-main dark:text-white mb-4 font-display leading-tight">
              The SME <br />Compliance Gap
            </h3>
            <p className="text-text-muted dark:text-stone-400 text-base leading-relaxed mb-6">
              By 2026, the EU requires Digital Product Passports for key product categories. Traditional enterprise solutions are too complex and costly for the average supplier.
            </p>
            <a href="#" className="group inline-flex items-center text-primary dark:text-accent font-bold text-sm">
              <span className="border-b-2 border-primary/20 group-hover:border-primary dark:group-hover:border-accent transition-colors pb-0.5">
                Read 2024 Market Report
              </span>
              <Icon name="arrow_forward" className="text-lg ml-1 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>

          {/* Stats grid */}
          <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Stat 1 */}
            <div className="bg-stone-50 dark:bg-stone-800/50 p-8 rounded-2xl border border-stone-100 dark:border-stone-800 hover:border-primary/20 transition-colors group">
              <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Icon name="warning" className="text-red-500" />
              </div>
              <div className="text-4xl font-bold text-text-main dark:text-white mb-2 font-display">80%</div>
              <p className="text-xs font-bold uppercase text-stone-400 tracking-wide mb-3">Unprepared Market</p>
              <p className="text-sm text-text-muted leading-relaxed">Of SME suppliers currently lack the digital infrastructure for ESPR mandates.</p>
            </div>

            {/* Stat 2 */}
            <div className="bg-stone-50 dark:bg-stone-800/50 p-8 rounded-2xl border border-stone-100 dark:border-stone-800 hover:border-primary/20 transition-colors group">
              <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/20 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Icon name="attach_money" className="text-orange-500" />
              </div>
              <div className="text-4xl font-bold text-text-main dark:text-white mb-2 font-display">€5k+</div>
              <p className="text-xs font-bold uppercase text-stone-400 tracking-wide mb-3">Legacy Cost</p>
              <p className="text-sm text-text-muted leading-relaxed">Typical annual cost per product line with enterprise-grade legal & tech firms.</p>
            </div>

            {/* Stat 3 - Highlighted */}
            <div className="bg-primary text-white p-8 rounded-2xl shadow-xl relative overflow-hidden group sm:col-span-2 lg:col-span-1">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-accent rounded-full opacity-20 blur-2xl group-hover:scale-150 transition-transform duration-700" />
              <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm border border-white/10">
                <Icon name="trending_down" className="text-accent" />
              </div>
              <div className="text-4xl font-bold text-white mb-2 font-display">90%</div>
              <p className="text-xs font-bold uppercase text-accent tracking-wide mb-3">Cost Reduction</p>
              <p className="text-sm text-stone-200 leading-relaxed relative z-10">EuroComply reduces overhead through automation and tiered SME pricing.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ===========================================
// PLATFORM CAPABILITIES SECTION
// ===========================================
function PlatformSection() {
  const capabilities = [
    {
      icon: 'gavel',
      title: 'Regulatory Automation',
      description: 'Our engine continuously monitors EU Official Journal updates. Your passports are automatically adjusted to meet the latest ESPR and Delegated Acts requirements.',
    },
    {
      icon: 'wallet',
      title: 'Cost-Optimized Licensing',
      description: 'Pricing tiers structured specifically for low-margin, high-volume manufacturing. Pay only for active Stock Keeping Units (SKUs) in the market.',
    },
    {
      icon: 'qr_code_scanner',
      title: 'Traceability Infrastructure',
      description: 'Generate GS1-compatible QR codes instantly. Link physical products to their digital twins with carrier-grade reliability and 99.9% uptime.',
    },
  ];

  return (
    <section id="platform" className="py-24 bg-background-light dark:bg-background-dark relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/cubes.png')" }} />

      <div className="container mx-auto px-4 max-w-[1400px] relative z-10">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          <span className="text-accent font-bold tracking-widest uppercase text-xs mb-3 block">Platform Capabilities</span>
          <h2 className="text-text-main dark:text-white text-3xl md:text-5xl font-bold tracking-tight mb-6 font-display">
            Enterprise Infrastructure <br />
            <span className="text-primary dark:text-stone-400">for Agile Suppliers</span>
          </h2>
          <p className="text-text-muted dark:text-stone-400 text-lg font-light">
            We translate complex EU directives into a streamlined, automated workflow designed for operational efficiency.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className="bg-white dark:bg-stone-900 rounded-2xl p-8 border border-stone-200/60 dark:border-stone-800 shadow-sm hover:shadow-card hover:-translate-y-1 transition-all duration-300 group"
            >
              <div className="w-16 h-16 bg-stone-50 dark:bg-stone-800 rounded-xl flex items-center justify-center mb-8 border border-stone-100 dark:border-stone-700 group-hover:bg-primary group-hover:border-primary transition-colors">
                <Icon name={cap.icon} className="text-3xl text-stone-700 dark:text-stone-300 group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-xl font-bold text-text-main dark:text-white mb-3 font-display">{cap.title}</h3>
              <p className="text-text-muted dark:text-stone-400 leading-relaxed text-sm">{cap.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===========================================
// ROADMAP SECTION
// ===========================================
function RoadmapSection() {
  const steps = [
    {
      number: 1,
      title: 'Data Ingestion',
      description: 'Upload BOM (Bill of Materials) via CSV or API. Our pre-built templates ensure correct formatting for EU databases.',
      features: ['Bulk Processing', 'ERP Ready'],
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBM4C5SpeRMlEMu2ZaAyYWUZRAkJvrA5tJJBz6ob4RDzMG4kGIf9P1DrJeatesDkVJYUj3j-JdKEPbFLjlZ_TA-zCXJsxaPr0xwQhW_TLKnVz4o2PSAfHYFdbQlVDP1-TC6AhtbFrHg8Z8hl7fegnNEsGjDQKhSAOAKXdPKVKcT3Z58fIbEWk0v8KR_zk8kr82LLIFjhc_A9JGoxC_Yz2FRKd7uLj0eP4XYZQfxFcV4yKH_fqy1akQ8stZ_Zjmd_L5u6RWnhmuBhGk',
    },
    {
      number: 2,
      title: 'Compliance Validation',
      description: 'The system automatically checks your product data against current ESPR rules. Gaps are flagged immediately.',
      features: ['Auto Audit', 'Alerts'],
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDBE49favubP9FkFfUp09P58iELdNIVPGqCrpaoyT7m00gjPprzMZbbr_GEjOcWf4iaCsu485-vmIrq0doFXkuX7zXtdeHRHOwtb70J1vj7kFCXc_cVsJg_fVhJr5QMz5fgKZpmgQ1awxjB5ZjMg3LHOv8n6LqTaqrw9eN-49MVxDs8VbKmQuNF3fyCht4vuqKUdUGDFPwyUPDr7YC4fR6Z1ghnk_iR6gSyIg4SRVn4q7_CqMwizUcZXie_TX-XoqWTvFsLd3WV6Kk',
    },
    {
      number: 3,
      title: 'Passport Issuance',
      description: 'Once validated, the official Digital Product Passport is minted. Download QR labels and manage records.',
      features: ['Vector Export', 'Public Portal'],
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDgJnM4ScPcj_lEHGK6TgumlibaKw3PtEb9uqFQ1P5aG0pOfZX3LP90GyYdQMxbARFJmpi_t8szrMq_uSrkAvK7anNaeWHVJGj1MXeRInTVYpMLcqdblyFr_SMp-pse4s1CX5XnxwYIALOacLoEvB3y4H-j_QJikJG7Ja5_4rgwhEF_X39K6fLlzEUKIdiq3ktEcoIk5tl_wIS-dOrd_yqLM7HhS17B71zUl33nNO-5gpKSD0Fc41yOyVhznXhIkriAnom_59eH3ws',
    },
  ];

  return (
    <section id="roadmap" className="py-24 bg-stone-50 dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800">
      <div className="container mx-auto px-4 max-w-[1400px]">
        <div className="flex flex-col lg:flex-row gap-20">
          {/* Left sidebar */}
          <div className="lg:w-1/3 sticky top-32 self-start">
            <h2 className="text-4xl font-bold text-text-main dark:text-white mb-6 font-display">Implementation Roadmap</h2>
            <p className="text-text-muted dark:text-stone-400 mb-8 text-lg">
              Achieving full compliance doesn&apos;t require a dedicated legal team. Follow our streamlined three-step process.
            </p>
            <button className="flex items-center gap-3 text-primary dark:text-accent font-bold group hover:opacity-80 transition-opacity">
              View Documentation
              <Icon name="arrow_right_alt" className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Steps */}
          <div className="lg:w-2/3 flex flex-col gap-16 pl-4 lg:pl-0 border-l-2 border-stone-200 dark:border-stone-800 lg:border-none">
            {steps.map((step) => (
              <div key={step.number} className="relative group">
                <div className="hidden lg:flex absolute -left-12 top-0 w-8 h-8 rounded-full bg-white dark:bg-stone-800 border-2 border-stone-300 dark:border-stone-600 items-center justify-center text-stone-500 font-bold text-sm z-10 group-hover:border-primary group-hover:text-primary transition-colors">
                  {step.number}
                </div>
                <div className="grid md:grid-cols-2 gap-8 items-center bg-white dark:bg-stone-900/50 p-6 rounded-2xl hover:shadow-lg transition-shadow border border-transparent hover:border-stone-100 dark:hover:border-stone-800">
                  <div>
                    <h3 className="text-2xl font-bold text-text-main dark:text-white mb-3 font-display">{step.title}</h3>
                    <p className="text-sm text-text-muted dark:text-stone-400 mb-5 leading-relaxed">{step.description}</p>
                    <div className="flex gap-4">
                      {step.features.map((feature) => (
                        <span key={feature} className="flex items-center gap-1.5 text-xs font-semibold text-primary dark:text-accent uppercase tracking-wide">
                          <Icon name="check" className="text-sm" /> {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl overflow-hidden shadow-sm h-48 relative group-hover:scale-[1.02] transition-transform duration-500">
                    <div className="absolute inset-0 bg-primary/10 z-10 group-hover:bg-transparent transition-colors" />
                    <div
                      className="w-full h-full bg-cover bg-center"
                      style={{ backgroundImage: `url('${step.image}')` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ===========================================
// PRICING SECTION
// ===========================================
function PricingSection() {
  return (
    <section id="pricing" className="py-24 bg-background-light dark:bg-background-dark">
      <div className="container mx-auto px-4 max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
          <div className="max-w-2xl">
            <span className="text-accent font-bold tracking-widest uppercase text-xs mb-3 block">Licensing</span>
            <h2 className="text-text-main dark:text-white text-4xl font-bold tracking-tight mb-4 font-display">
              Transparent, Predictable Costs
            </h2>
            <p className="text-text-muted dark:text-stone-400 text-lg">
              Predictable costs for your compliance budget. No hidden integration fees.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-stone-100 dark:bg-stone-800 p-1 rounded-lg">
            <button className="px-4 py-2 bg-white dark:bg-stone-700 shadow-sm rounded-md text-sm font-bold text-text-main dark:text-white">
              Monthly
            </button>
            <button className="px-4 py-2 text-stone-500 dark:text-stone-400 text-sm font-medium hover:text-primary dark:hover:text-white">
              Yearly (-20%)
            </button>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Validation tier */}
          <div className="bg-white dark:bg-stone-900 rounded-2xl p-8 border border-stone-200 dark:border-stone-800 shadow-sm flex flex-col h-full hover:border-stone-300 transition-colors">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-text-main dark:text-white font-display">Validation</h3>
              <p className="text-xs text-text-muted uppercase tracking-wide mt-1">Proof of Concept</p>
            </div>
            <div className="mb-8 pb-8 border-b border-stone-100 dark:border-stone-800">
              <span className="text-5xl font-bold text-text-main dark:text-white tracking-tight">€0</span>
              <span className="text-text-muted font-medium">/mo</span>
            </div>
            <ul className="space-y-4 mb-10 flex-1">
              <li className="flex items-start gap-3 text-sm text-stone-600 dark:text-stone-300">
                <Icon name="check_circle" className="text-primary dark:text-accent text-lg" />
                1 Digital Product Passport
              </li>
              <li className="flex items-start gap-3 text-sm text-stone-600 dark:text-stone-300">
                <Icon name="check_circle" className="text-primary dark:text-accent text-lg" />
                Basic Compliance Check
              </li>
              <li className="flex items-start gap-3 text-sm text-stone-600 dark:text-stone-300">
                <Icon name="check_circle" className="text-primary dark:text-accent text-lg" />
                Standard Support
              </li>
            </ul>
            <button className="w-full py-4 rounded-xl border-2 border-stone-100 dark:border-stone-700 font-bold text-text-main dark:text-white hover:border-primary hover:text-primary transition-all bg-transparent">
              Start Verification
            </button>
          </div>

          {/* Standard tier - Popular */}
          <div className="relative bg-primary dark:bg-stone-800 rounded-2xl p-8 shadow-2xl shadow-primary/20 flex flex-col md:-mt-6 h-full border border-primary dark:border-stone-700">
            <div className="absolute top-0 right-0 bg-accent text-primary-dark text-[10px] font-bold px-4 py-1.5 rounded-bl-xl rounded-tr-xl uppercase tracking-wide">
              Most Popular
            </div>
            <div className="mb-6">
              <h3 className="text-xl font-bold text-white font-display">Standard</h3>
              <p className="text-xs text-white/80 uppercase tracking-wide mt-1">For Active Suppliers</p>
            </div>
            <div className="mb-8 pb-8 border-b border-white/10">
              <span className="text-5xl font-bold text-white tracking-tight">€49</span>
              <span className="text-white/60 font-medium">/mo</span>
            </div>
            <ul className="space-y-4 mb-10 flex-1">
              <li className="flex items-start gap-3 text-sm text-white/90">
                <Icon name="check_circle" className="text-accent text-lg" />
                Up to 50 Passports
              </li>
              <li className="flex items-start gap-3 text-sm text-white/90">
                <Icon name="check_circle" className="text-accent text-lg" />
                Bulk CSV Upload & API
              </li>
              <li className="flex items-start gap-3 text-sm text-white/90">
                <Icon name="check_circle" className="text-accent text-lg" />
                Dynamic QR (GS1 Ready)
              </li>
              <li className="flex items-start gap-3 text-sm text-white/90">
                <Icon name="check_circle" className="text-accent text-lg" />
                Audit Logs & History
              </li>
            </ul>
            <button className="w-full py-4 rounded-xl bg-white text-primary font-bold hover:bg-stone-100 transition-all shadow-lg">
              Get Compliant Now
            </button>
          </div>

          {/* Enterprise tier */}
          <div className="bg-white dark:bg-stone-900 rounded-2xl p-8 border border-stone-200 dark:border-stone-800 shadow-sm flex flex-col h-full hover:border-stone-300 transition-colors">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-text-main dark:text-white font-display">Enterprise</h3>
              <p className="text-xs text-text-muted uppercase tracking-wide mt-1">Multi-National</p>
            </div>
            <div className="mb-8 pb-8 border-b border-stone-100 dark:border-stone-800">
              <span className="text-5xl font-bold text-text-main dark:text-white tracking-tight">Custom</span>
            </div>
            <ul className="space-y-4 mb-10 flex-1">
              <li className="flex items-start gap-3 text-sm text-stone-600 dark:text-stone-300">
                <Icon name="check_circle" className="text-primary dark:text-accent text-lg" />
                Unlimited Volume
              </li>
              <li className="flex items-start gap-3 text-sm text-stone-600 dark:text-stone-300">
                <Icon name="check_circle" className="text-primary dark:text-accent text-lg" />
                Dedicated Success Manager
              </li>
              <li className="flex items-start gap-3 text-sm text-stone-600 dark:text-stone-300">
                <Icon name="check_circle" className="text-primary dark:text-accent text-lg" />
                Custom Integrations
              </li>
            </ul>
            <button className="w-full py-4 rounded-xl border-2 border-stone-100 dark:border-stone-700 font-bold text-text-main dark:text-white hover:border-primary hover:text-primary transition-all bg-transparent">
              Contact Sales
            </button>
          </div>
        </div>

        {/* Security badge */}
        <div className="mt-16 bg-white dark:bg-stone-900 p-8 rounded-2xl border border-stone-200 dark:border-stone-800 flex flex-col md:flex-row items-center justify-between gap-8 shadow-sm">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
              <Icon name="shield_lock" className="text-stone-400 text-2xl" />
            </div>
            <div>
              <p className="font-bold text-text-main dark:text-white text-lg font-display">Enterprise Security Standards</p>
              <p className="text-sm text-text-muted">ISO 27001 Certified Data Centers & GDPR Compliant Processing</p>
            </div>
          </div>
          <a href="#" className="text-sm font-bold text-primary dark:text-accent hover:underline flex items-center">
            View Security Whitepaper <Icon name="arrow_forward" className="text-lg ml-1" />
          </a>
        </div>
      </div>
    </section>
  );
}

// ===========================================
// CTA SECTION
// ===========================================
function CTASection() {
  return (
    <section className="py-24 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800">
      <div className="container mx-auto px-4 max-w-[1200px] text-center">
        <div className="inline-block p-3 rounded-full bg-stone-50 dark:bg-stone-800 mb-6">
          <Icon name="verified" className="text-primary dark:text-accent text-3xl" />
        </div>
        <h2 className="text-5xl md:text-6xl font-bold text-text-main dark:text-white mb-8 tracking-tight font-display">
          Secure Your <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Supply Chain Today</span>
        </h2>
        <p className="text-xl text-text-muted dark:text-stone-400 mb-12 max-w-2xl mx-auto leading-relaxed">
          Don&apos;t let the 2026 deadline catch you unprepared. Join thousands of SME suppliers using EuroComply to future-proof their business.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-5">
          <button className="flex items-center justify-center rounded-xl h-14 px-10 btn-gradient text-white text-lg font-bold transition-all shadow-xl shadow-primary/20 hover:scale-105">
            Start Compliance Check
          </button>
          <button className="flex items-center justify-center rounded-xl h-14 px-10 bg-white dark:bg-stone-800 text-text-main dark:text-white border border-stone-200 dark:border-stone-700 text-lg font-bold hover:bg-stone-50 dark:hover:bg-stone-700 transition-all hover:scale-105">
            Book Strategy Call
          </button>
        </div>
      </div>
    </section>
  );
}

// ===========================================
// FOOTER
// ===========================================
function Footer() {
  return (
    <footer className="bg-background-light dark:bg-background-dark border-t border-stone-200 dark:border-stone-800 py-16 text-sm">
      <div className="container mx-auto px-4 max-w-[1400px]">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-16">
          {/* Brand column */}
          <div className="col-span-1 md:col-span-2 pr-8">
            <div className="flex items-center gap-2 mb-6">
              <h2 className="text-2xl font-bold leading-none tracking-tighter font-sans text-[#00332A] dark:text-white">
                EuroComply<span className="text-[#2DD4BF]">.</span>
              </h2>
            </div>
            <p className="text-stone-600 dark:text-stone-400 mb-8 leading-relaxed max-w-sm">
              The premier Digital Product Passport platform for European SMEs. We simplify regulatory complexity so you can focus on manufacturing excellence.
            </p>
            <div className="flex items-center gap-2 text-stone-500 text-xs font-semibold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>System Status: <span className="text-stone-700 dark:text-stone-300">Operational</span></span>
            </div>
          </div>

          {/* Platform links */}
          <div>
            <h4 className="font-bold text-text-main dark:text-white mb-6 font-display text-lg">Platform</h4>
            <ul className="space-y-4 text-stone-600 dark:text-stone-400">
              <li><a href="#" className="hover:text-primary dark:hover:text-accent transition-colors">Features</a></li>
              <li><a href="#" className="hover:text-primary dark:hover:text-accent transition-colors">Pricing</a></li>
              <li><a href="#" className="hover:text-primary dark:hover:text-accent transition-colors">API Documentation</a></li>
              <li><a href="#" className="hover:text-primary dark:hover:text-accent transition-colors">Security</a></li>
            </ul>
          </div>

          {/* Resources links */}
          <div>
            <h4 className="font-bold text-text-main dark:text-white mb-6 font-display text-lg">Resources</h4>
            <ul className="space-y-4 text-stone-600 dark:text-stone-400">
              <li><a href="#" className="hover:text-primary dark:hover:text-accent transition-colors">ESPR Guide 2024</a></li>
              <li><a href="#" className="hover:text-primary dark:hover:text-accent transition-colors">Compliance Blog</a></li>
              <li><a href="#" className="hover:text-primary dark:hover:text-accent transition-colors">Case Studies</a></li>
              <li><a href="#" className="hover:text-primary dark:hover:text-accent transition-colors">Help Center</a></li>
            </ul>
          </div>

          {/* Legal links */}
          <div>
            <h4 className="font-bold text-text-main dark:text-white mb-6 font-display text-lg">Legal</h4>
            <ul className="space-y-4 text-stone-600 dark:text-stone-400">
              <li><a href="#" className="hover:text-primary dark:hover:text-accent transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-primary dark:hover:text-accent transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-primary dark:hover:text-accent transition-colors">Cookie Policy</a></li>
              <li><a href="#" className="hover:text-primary dark:hover:text-accent transition-colors">DPA</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-stone-200 dark:border-stone-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-stone-500">© 2024 EuroComply SaaS. All rights reserved. HQ: Brussels, Belgium.</p>
          <div className="flex gap-6">
            <a href="#" className="text-stone-400 hover:text-primary dark:hover:text-accent transition-colors">
              <span className="sr-only">Twitter</span>
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
              </svg>
            </a>
            <a href="#" className="text-stone-400 hover:text-primary dark:hover:text-accent transition-colors">
              <span className="sr-only">LinkedIn</span>
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ===========================================
// MAIN PAGE COMPONENT
// ===========================================
export default function LandingPage() {
  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden bg-background-light dark:bg-background-dark text-text-main dark:text-stone-100">
      <Navigation />
      <HeroSection />
      <ComplianceGapSection />
      <PlatformSection />
      <RoadmapSection />
      <PricingSection />
      <CTASection />
      <Footer />
    </div>
  );
}
