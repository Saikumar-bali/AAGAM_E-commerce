from pathlib import Path


def replace(pathname: str, old: str, new: str) -> None:
    path = Path(pathname)
    source = path.read_text()
    if old in source:
        path.write_text(source.replace(old, new))
        return
    if new in source:
        return
    raise SystemExit(f'Expected source fragment not found in {pathname}: {old}')

login = 'apps/admin-dashboard/src/app/(auth)/login/page.tsx'
replace(login, "import { useEffect, useState } from 'react';", "import { Suspense, useEffect, useState } from 'react';")
replace(login, 'export default function LoginPage() {', 'function LoginPageContent() {')
login_path = Path(login)
login_source = login_path.read_text()
login_wrapper = '''\n\nexport default function LoginPage() {\n  return (\n    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-slate-50"><Loader2 className="h-7 w-7 animate-spin text-teal-700" /></main>}>\n      <LoginPageContent />\n    </Suspense>\n  );\n}\n'''
if '<LoginPageContent />' not in login_source:
    login_path.write_text(login_source.rstrip() + login_wrapper)

signup = 'apps/admin-dashboard/src/app/(auth)/signup/page.tsx'
replace(signup, "import { useEffect, useState } from 'react';", "import { Suspense, useEffect, useState } from 'react';")
replace(signup, 'export default function SignupPage() {', 'function SignupPageContent() {')
signup_path = Path(signup)
signup_source = signup_path.read_text()
signup_wrapper = '''\n\nexport default function SignupPage() {\n  return (\n    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-slate-50"><Loader2 className="h-7 w-7 animate-spin text-teal-700" /></main>}>\n      <SignupPageContent />\n    </Suspense>\n  );\n}\n'''
if '<SignupPageContent />' not in signup_source:
    signup_path.write_text(signup_source.rstrip() + signup_wrapper)

contract = 'scripts/aagaam-customer-experience.contract.test.js'
replace(
    contract,
    "contains(webLogin, \"customerAuthHref('/signup', customerReturnPath)\", 'The login create-account link must preserve the validated customer destination.');",
    "contains(webLogin, \"customerAuthHref('/signup', customerReturnPath)\", 'The login create-account link must preserve the validated customer destination.');\ncontains(webLogin, '<LoginPageContent />', 'The login search-parameter client content must be wrapped in Suspense.');",
)
replace(
    contract,
    "contains(signup, \"customerAuthHref('/login', returnTo)\", 'Signup must preserve the destination when returning to login.');",
    "contains(signup, \"customerAuthHref('/login', returnTo)\", 'Signup must preserve the destination when returning to login.');\ncontains(signup, '<SignupPageContent />', 'The signup search-parameter client content must be wrapped in Suspense.');",
)
