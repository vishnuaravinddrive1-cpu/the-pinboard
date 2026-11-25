/** Operator and site settings in one place, so Terms text never needs editing for these. */
export const config = {
  siteName: 'Pin Board',
  tagline: "What's happening in Chennai",
  domain: 'pinboard.tcqindia.com',
  fallbackDomain: 'thepinboard.com',
  tcqUrl: 'https://www.tcqindia.com',
  operator: {
    name: 'Vishnu Aravind',
    org: 'The Curiosity Quotient',
    address: '66, Baroda Street, West Mambalam, Chennai',
    contact: 'thecuriosityquotient@gmail.com',
  },
  termsVersion: '2026-11-01',
  boardLimit: 100,
  timezone: 'Asia/Kolkata',
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
  categories: ['Experience', 'Arts', 'Knowledge', 'Discussion', 'Social', 'Other'] as const,
  areas: [
    'Adyar', 'Alwarpet', 'Anna Nagar', 'Besant Nagar', 'Chromepet', 'ECR', 'Egmore', 'Guindy', 'Kilpauk',
    'Kodambakkam', 'Mylapore', 'Nungambakkam', 'OMR', 'Perungudi', 'Porur', 'Royapettah', 'T. Nagar',
    'Tambaram', 'Thiruvanmiyur', 'Velachery', 'West Mambalam', 'Other',
  ],
}
export const demoMode = !config.supabaseUrl || !config.supabaseAnonKey
