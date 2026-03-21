import { useContext } from '@vertz/ui';
import type { TenantInfo } from '@vertz/ui/auth';
import { TenantContext } from '@vertz/ui/auth';
import type { JSX } from '@vertz/ui/jsx-runtime';

export interface TenantSwitcherProps {
  /** Custom render function for each tenant item. Defaults to tenant name. */
  renderItem?: (tenant: TenantInfo) => unknown;
  /** CSS class for the container element. */
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export function TenantSwitcher({
  renderItem,
  className,
  class: classProp,
}: TenantSwitcherProps): JSX.Element {
  const rawCtx = useContext(TenantContext);
  if (!rawCtx) {
    throw new Error('TenantSwitcher requires TenantProvider');
  }
  // Bind to a const for closure capture (TS narrowing doesn't cross closures)
  const ctx = rawCtx;

  const effectiveClass = className ?? classProp;

  const renderTenant = (tenant: TenantInfo) => {
    if (renderItem) return renderItem(tenant);
    return tenant.name;
  };

  // wrapSignalProps auto-unwraps: ctx.tenants is TenantInfo[], ctx.currentTenantId is string | undefined
  const tenants = (ctx.tenants ?? []) as TenantInfo[];
  const currentId = ctx.currentTenantId as string | undefined;
  const currentTenant = tenants.find((t) => t.id === currentId);

  function handleSelect(tenantId: string) {
    if (tenantId !== ctx.currentTenantId) {
      void (ctx.switchTenant as (id: string) => Promise<unknown>)(tenantId);
    }
  }

  return (
    <div className={effectiveClass} data-part="tenant-switcher">
      <button type="button" data-part="trigger">
        {currentTenant ? renderTenant(currentTenant) : 'Select tenant'}
      </button>
      <div data-part="content" style={{ display: 'none' }}>
        {tenants.map((tenant) => (
          <button
            type="button"
            key={tenant.id}
            data-part="item"
            data-value={tenant.id}
            data-selected={tenant.id === currentId ? 'true' : undefined}
            onClick={() => handleSelect(tenant.id)}
          >
            {renderTenant(tenant)}
          </button>
        ))}
      </div>
    </div>
  );
}
