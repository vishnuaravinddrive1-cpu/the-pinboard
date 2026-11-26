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
  termsVersion: '0.1',
  boardLimit: 100,
  timezone: 'Asia/Kolkata',
  categories: ['Experience', 'Arts', 'Knowledge', 'Discussion', 'Social', 'Other'] as const,
  areas: [
    'Adyar', 'Alwarpet', 'Anna Nagar', 'Besant Nagar', 'Chromepet', 'ECR', 'Egmore', 'Guindy', 'Kilpauk',
    'Kodambakkam', 'Mylapore', 'Nungambakkam', 'OMR', 'Perungudi', 'Porur', 'Royapettah', 'T. Nagar',
    'Tambaram', 'Thiruvanmiyur', 'Velachery', 'West Mambalam', 'Other',
  ],
}
