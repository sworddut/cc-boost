export interface AllowResponse {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'allow';
    updatedInput: { command: string };
  };
}

export interface BlockResponse {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'block';
    reason: string;
  };
}

export interface PassthroughResponse {
  continue: true;
  suppressOutput: true;
}

export function allowWithWrappedCommand(command: string): AllowResponse {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: { command },
    },
  };
}

export function blockWithReason(reason: string): BlockResponse {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'block',
      reason,
    },
  };
}

export function passthrough(): PassthroughResponse {
  return { continue: true, suppressOutput: true };
}
