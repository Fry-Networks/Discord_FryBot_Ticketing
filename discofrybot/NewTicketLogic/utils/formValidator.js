// NewTicketLogic/utils/formValidator.js
const { TextInputBuilder, TextInputStyle } = require('discord.js');
const validator = require('validator');
const { ERROR_MESSAGES } = require('./validationErrorManager'); // Adjusted path

const PREFIXES = [
    'BM','ISM','OSM','IDM','ODM','HWM','LWM',
    'IHAQM','ILAQM','OHAQM','IMAQM','IRM','OHWQM','OLWQM',
    'EM','AOWSCM','AIWSCM','AOWCM','AIWCM',
    'AOSCM','AISCM','AOTCM','AITCM','RDN','SVN','SDN','AEM'
  ];

const SINGLE_MINER_KEY_REGEX = `(?:${PREFIXES.join('|')})-[A-Z0-9]{31,33}`;
const minerKeyRegex = new RegExp(`^${SINGLE_MINER_KEY_REGEX}(?:[ ,;\\n]${SINGLE_MINER_KEY_REGEX})*$`);

const VALIDATION_PATTERNS = {
    EMAIL: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
    ORDER_NUMBER: /^\d{5}$/,
    ALGORAND_ADDRESS: /^[A-Z2-7]{58}$/,
    MINER_KEYS: minerKeyRegex,
    // Modified regex for more flexible matching of "Order" (case-insensitive) and spacing (\s*)
    ORDERS_QUANTITIES: /^order\s*\d+:\s*\d+\s*nodes?(?:\norder\s*\d+:\s*\d+\s*nodes?)*$/i,
};

const baseFields = {
    contact_info: new TextInputBuilder()
        .setCustomId('contact_info')
        .setLabel('Contact Information (Full Name+Email)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., John Smith johnsmith@email.com'),
    order_number: new TextInputBuilder()
        .setCustomId('order_number')
        .setLabel('Order Number')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Enter your 5-digit order number'),
    minerkeys: new TextInputBuilder()
        .setCustomId('minerkeys')
        .setLabel('Miner Keys')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('e.g., IRM-A1BJD26E2FSO2F337SQ3BEF4DRAAWPE3\n(Separate multiple keys with space, comma, or semicolon)'),
    algorand_address: new TextInputBuilder()
        .setCustomId('algorand_address')
        .setLabel('Algorand Address')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., RL6VDLXCN5G7N2GRTS7YLVDSFT4PVBBUOVTVS7T26OQ5MLXYQKRMI5ADXY'),
    description: new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Describe Your Issue')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Provide a brief description of your issue'),
    orders_quantities: new TextInputBuilder()
        .setCustomId('orders_quantities')
        .setLabel('Orders and Quantities')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('e.g., Order #12345: 2 nodes\nOrder #67890: 1 node')
};

const ticketFields = {
    order_tracking: ['contact_info', 'order_number', 'description'],
    registration: ['contact_info', 'minerkeys', 'order_number', 'algorand_address', 'description'],
    miner_keys: ['contact_info', 'order_number', 'algorand_address', 'description'],
    rewards: ['contact_info', 'minerkeys', 'order_number', 'algorand_address', 'description'],
    tech_support: ['contact_info', 'minerkeys', 'order_number', 'algorand_address', 'description'],
    node_forgo_return: ['contact_info', 'order_number', 'orders_quantities', 'algorand_address'],
    fry_conversion_issues: ['contact_info', 'algorand_address', 'description']
};

// Sanitization + Validation Functions
function sanitizeAndValidateContactInfo(value) {
    if (!value) return { error: ERROR_MESSAGES.CONTACT_INFO };
    const trimmedValue = validator.trim(value);
    const contactRegex = /^(.+?)\s+([\w.-]+@[\w.-]+\.\w+)$/;
    const match = trimmedValue.match(contactRegex);
    if (!match) return { error: ERROR_MESSAGES.CONTACT_INFO };
    
    const fullName = match[1].trim();
    const emailPart = match[2].trim();
    
    // NormalizeEmail can throw if the email is fundamentally malformed (e.g. missing @)
    // It's better to test with regex first for basic structure.
    if (!VALIDATION_PATTERNS.EMAIL.test(emailPart)) return { error: ERROR_MESSAGES.EMAIL };
    const email = validator.normalizeEmail(emailPart);
    if (!email) return { error: ERROR_MESSAGES.EMAIL }; // normalizeEmail returns false for some invalid emails

    return { value: { fullName, email } };
}

function sanitizeAndValidateOrderNumber(value) {
    if (!value) return { error: ERROR_MESSAGES.ORDER_NUMBER };
    const sanitizedValue = validator.trim(value);
    if (!VALIDATION_PATTERNS.ORDER_NUMBER.test(sanitizedValue)) return { error: ERROR_MESSAGES.ORDER_NUMBER };
    return { value: sanitizedValue };
}

function sanitizeAndValidateAlgorandAddress(value) {
    if (!value) return { error: ERROR_MESSAGES.ALGORAND_ADDRESS };
    const sanitizedValue = validator.trim(value);
    if (!VALIDATION_PATTERNS.ALGORAND_ADDRESS.test(sanitizedValue)) return { error: ERROR_MESSAGES.ALGORAND_ADDRESS };
    return { value: sanitizedValue };
}

function sanitizeAndValidateMinerKeys(value) {
    if (!value) return { error: ERROR_MESSAGES.MINER_KEYS }; // This error will only be hit if the field is required and empty
    const trimmedValue = validator.trim(value || ''); // Ensure value is a string for trim
    if (validator.isEmpty(trimmedValue)) return { value: null }; // Return null if empty (for optional fields)

    // Split by common delimiters: comma, semicolon, or space/newline
    const keys = trimmedValue.split(/[,\s;]+/).filter(key => key.length > 0);

    const invalidKeys = [];
    for (const key of keys) {
        if (!new RegExp(`^${SINGLE_MINER_KEY_REGEX}$`).test(key)) { // Validate each individual key
            invalidKeys.push(key);
        }
    }

    if (invalidKeys.length > 0) {
        return { error: `${ERROR_MESSAGES.MINER_KEYS}: Invalid key(s) found: ${invalidKeys.join(', ')}` };
    }

    return { value: keys.join(';') }; // Store as semicolon-separated for consistency
}

/**
 * Sanitizes and validates the 'Orders and Quantities' input.
 * Extracts order numbers (5 digits) and quantities (number followed by 'node' or 'nodes') from each line.
 * @param {string} value - The raw input value from the modal.
 * @returns {{value: Array<{order: string, quantity: number}>} | {error: string}} - An object with either the parsed data or an error message.
 */
function sanitizeAndValidateOrdersQuantities(value) {
    if (!value) return { error: ERROR_MESSAGES.ORDERS_QUANTITIES_EMPTY };
    const trimmedValue = validator.trim(value);
    if (validator.isEmpty(trimmedValue)) return { error: ERROR_MESSAGES.ORDERS_QUANTITIES_EMPTY };

    const lines = trimmedValue.split('\n').map(line => line.trim()).filter(line => line.length > 0); // Split, trim, and remove empty lines
    const parsedOrders = [];
    const lineErrors = [];

    // Regex to find a 5-digit number (potential order number)
    const orderNumberRegex = /\d{5}/;
    // Regex to find a number followed by 'node' or 'nodes' (potential quantity)
    const quantityRegex = /(\d+)\s*nodes?/i;

    for (const line of lines) {
        const orderMatch = line.match(orderNumberRegex);
        const quantityMatch = line.match(quantityRegex);

        if (orderMatch && quantityMatch && quantityMatch[1]) {
            const order = orderMatch[0]; // The matched 5-digit number
            const quantity = parseInt(quantityMatch[1], 10); // The number before 'node(s)'

            if (!isNaN(quantity)) {
                parsedOrders.push({ order, quantity });
            } else {
                // Should not happen with the regex, but good practice
                lineErrors.push(`Could not parse quantity on line: "${line}"`);
            }
        } else {
            lineErrors.push(`Could not find a 5-digit order number and a quantity (e.g., "2 nodes") on line: "${line}"`);
        }
    }

    if (lineErrors.length > 0) {
        // Combine errors for all problematic lines
        return { error: ERROR_MESSAGES.ORDERS_QUANTITIES_FORMAT + "\n" + lineErrors.join('\n') };
    }

    if (parsedOrders.length === 0) {
         // If no lines were successfully parsed but there were no specific line errors (e.g., input was just random text)
         return { error: ERROR_MESSAGES.ORDERS_QUANTITIES_EMPTY }; // Or a more specific error if needed
    }


    // Return the array of parsed order/quantity objects
    return { value: parsedOrders };
}

function sanitizeAndValidateDescription(value) {
    if (!value) return { error: 'Description cannot be empty.' };
    const trimmedValue = validator.trim(value);
    if (validator.isEmpty(trimmedValue)) return { error: 'Description cannot be empty.' };
    // Removed validator.escape() as it's not needed for database storage or Discord display
    const sanitizedValue = trimmedValue; // Keep the trimmed value
    return { value: sanitizedValue };
}

function validateTicketSubmission(ticketType, fields) {
    const requiredFieldKeys = ticketFields[ticketType];
    if (!requiredFieldKeys) {
        // This case should ideally be caught earlier, e.g., when building the modal
        return { errors: ['Invalid ticket type specified.'], validatedData: {} };
    }

    const errors = [];  
    const validatedData = {};

    requiredFieldKeys.forEach(fieldKey => {
        const rawValue = fields[fieldKey]; // rawValue can be undefined if not provided
        let result;

        switch (fieldKey) {
            case 'contact_info':
                result = sanitizeAndValidateContactInfo(rawValue);
                if (result.error) errors.push(result.error);
                else if (result.value) { // Ensure value exists
                    validatedData.fullName = result.value.fullName;
                    validatedData.email = result.value.email;
                }
                break;
            case 'order_number':
                result = sanitizeAndValidateOrderNumber(rawValue);
                if (result.error) errors.push(result.error);
                else if (result.value) validatedData.orderNumber = result.value;
                break;
            case 'algorand_address':
                result = sanitizeAndValidateAlgorandAddress(rawValue);
                if (result.error) errors.push(result.error);
                else if (result.value) validatedData.algorandAddress = result.value;
                break;
            case 'minerkeys':
                if (ticketType === 'fry_conversion_issues') {
                    const trimmedRawValue = validator.trim(rawValue || '');
                    // Allow empty, 'n/a', 'na', or 'none' (case-insensitive) for fry_conversion_issues, setting value to 'N/A'
                    if (validator.isEmpty(trimmedRawValue) || trimmedRawValue.toLowerCase() === 'n/a' || trimmedRawValue.toLowerCase() === 'na' || trimmedRawValue.toLowerCase() === 'none') {
                        validatedData.minerKeys = 'N/A'; // Set to 'N/A' as requested
                    } else {
                        // If a value is provided (and it's not one of the accepted optional values), validate it
                        result = sanitizeAndValidateMinerKeys(rawValue);
                        if (result.error) {
                            // Append the additional info to the existing error message
                            errors.push(`For Fry Conversion tickets, 'n/a', 'na', 'none', or blank are also accepted. ${result.error}`);
                        } else if (result.value) {
                            validatedData.minerKeys = result.value;
                        }
                    }
                } else {
                    // Existing logic for other ticket types
                    result = sanitizeAndValidateMinerKeys(rawValue);
                    if (result.error) errors.push(result.error);
                    else if (result.value) validatedData.minerKeys = result.value;
                }
                break;
            case 'orders_quantities':
                result = sanitizeAndValidateOrdersQuantities(rawValue);
                if (result.error) errors.push(result.error);
                else if (result.value) validatedData.ordersQuantities = result.value;
                break;
            case 'description':
                result = sanitizeAndValidateDescription(rawValue);
                if (result.error) errors.push(result.error);
                else if (result.value) validatedData.description = result.value;
                break;
            default:
                // Log if a fieldKey in ticketFields doesn't have a validation case
                console.warn(`No validation logic for fieldKey: ${fieldKey}`);
        }
    });

    return { errors, validatedData };
}

module.exports = {
    baseFields,
    ticketFields,
    validateTicketSubmission,
    VALIDATION_PATTERNS, // Exporting patterns might be useful for other modules if needed
    sanitizeAndValidateAlgorandAddress // Export the specific function
};
