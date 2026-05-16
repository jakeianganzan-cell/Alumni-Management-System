import { randomInt } from "crypto";

const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const NUMBERS = "23456789";
const SYMBOLS = "!@#$%&*?";
const ALL_CHARS = `${UPPERCASE}${LOWERCASE}${NUMBERS}${SYMBOLS}`;

const pick = (chars: string) => chars[randomInt(0, chars.length)];

export const generatePassword = (length = 12) => {
    const safeLength = Math.max(length, 10);
    const password = [
        pick(UPPERCASE),
        pick(LOWERCASE),
        pick(NUMBERS),
        pick(SYMBOLS)
    ];

    while (password.length < safeLength) {
        password.push(pick(ALL_CHARS));
    }

    for (let index = password.length - 1; index > 0; index -= 1) {
        const swapIndex = randomInt(0, index + 1);
        [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
    }

    return password.join("");
};
