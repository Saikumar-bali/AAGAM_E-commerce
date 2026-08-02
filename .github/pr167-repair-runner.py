from pathlib import Path

script_path = Path('.github/pr167-repair.py')
source = script_path.read_text(encoding='utf-8')

replacements = [
    (
        r'''text, count = re.subn(r"\n\s*placeholderData:\s*\(previousData\)\s*=>\s*previousData,", "", text, count=1)''',
        r'''text, count = re.subn(r"\n\s*placeholderData:\s*\([^)]*\)\s*=>\s*[^,]+,", "", text, count=1)''',
        'Store Orders placeholder callback anchor',
    ),
    (
        '''marker = "  const totalPages = Math.max(1, Number(data?.meta?.totalPages || 1));"''',
        '''marker = "  const totalPages = Math.max(1, Number(ordersQuery.data?.totalPages || 1));"''',
        'Store Orders total-pages response anchor',
    ),
    (
        '''const roles = new Set<string>((req.user?.roles || []).map(String));''',
        '''const roles = new Set<Role>([req.user.role, ...(req.user.roles || [])]);''',
        'Store order badge role set',
    ),
    (
        '''const stores = await this.prisma.store.findMany({''',
        '''const stores = await prisma.store.findMany({''',
        'Store order badge Prisma store query',
    ),
    (
        '''where: this.isAdmin(roles)''',
        '''where: roles.has(Role.ADMIN)''',
        'Store order badge admin check',
    ),
    (
        '''const count = await this.prisma.order.count({''',
        '''const count = await prisma.order.count({''',
        'Store order badge Prisma order count',
    ),
]

for old, new, label in replacements:
    if old not in source:
        raise SystemExit(f'{label} was not found in the repair script')
    source = source.replace(old, new, 1)

exec(compile(source, str(script_path), 'exec'), {'__name__': '__main__', '__file__': str(script_path)})


def replace_generated(path: str, old: str, new: str, label: str) -> None:
    file_path = Path(path)
    content = file_path.read_text(encoding='utf-8')
    if old not in content:
        raise SystemExit(f'{label} was not found in generated {path}')
    file_path.write_text(content.replace(old, new, 1), encoding='utf-8')


replace_generated(
    'apps/mobile-partners/src/screens/rider/RiderDashboard.tsx',
    """  const onlineToggleAction = onlinePermissionMissing
    ? grantOnlinePermission
    : () => changeAvailability(!isOnline);""",
    "  const onlineToggleAction = onlinePermissionMissing ? grantOnlinePermission : () => changeAvailability(!isOnline);",
    'Rider permission recovery action contract',
)
replace_generated(
    'apps/mobile-partners/src/screens/rider/RiderDeliveryFlowScreen.tsx',
    'function optionalLocation() {',
    'function capturePodLocation() {',
    'POD location helper declaration',
)
replace_generated(
    'apps/mobile-partners/src/screens/rider/RiderDeliveryFlowScreen.tsx',
    'const location = await optionalLocation();',
    'const location = await capturePodLocation();',
    'POD location helper call',
)

print('Normalized final Rider recovery and POD contract names.')
